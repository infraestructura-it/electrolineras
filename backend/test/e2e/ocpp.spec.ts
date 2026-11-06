// Gateway OCPP de punta a punta: un cargador falso por WebSocket contra la API real.
import { AppDePrueba, bearer, crearApp } from '../apoyo/app';
import { CargadorFalso, esperarQue } from '../apoyo/cargador-falso';

const TARIFA = 1190;
const energia = (wh: number, extra: Record<string, unknown>[] = []) => [
  { timestamp: new Date().toISOString(), sampledValue: [{ value: String(wh), measurand: 'Energy.Active.Import.Register', unit: 'Wh' }, ...extra] },
];

describe('Gateway OCPP', () => {
  let t: AppDePrueba;
  let empresa: string;
  const abiertos: CargadorFalso[] = [];

  const registrar = (numero_serie: string, version_ocpp = 'auto') =>
    t.http.post('/cargadores').set(bearer(t.token)).send({ numero_serie, operador_id: empresa, tarifa_por_kwh: TARIFA, version_ocpp });

  async function conectar(serie: string, protocolos?: string[]) {
    const c = await CargadorFalso.conectar(t.puerto, serie, protocolos);
    abiertos.push(c);
    return c;
  }

  const sesion = (id: string) => t.http.get(`/sesiones/${id}`).then((r) => r.body);
  const cargador = (serie: string) => t.http.get(`/cargadores/${serie}`).then((r) => r.body);

  beforeAll(async () => {
    t = await crearApp();
    empresa = (await t.http.post('/operadores').set(bearer(t.token)).send({ nombre: 'EV OCPP', comision_pactada: 10 })).body.id;
    // Sin simulación: si el cargador no está conectado, la app no debe poder iniciar.
    await t.http.patch('/configuracion').set(bearer(t.token)).send({ simular_medicion: false, tarjetas_rfid_autorizadas: ['TARJ01'] });
  });

  afterEach(async () => {
    await Promise.all(abiertos.splice(0).map((c) => c.cerrar()));
  });

  afterAll(() => t.cerrar());

  describe('handshake', () => {
    it('rechaza con 404 un número de serie no registrado', async () => {
      await expect(CargadorFalso.conectar(t.puerto, 'DESCONOCIDO')).rejects.toThrow('HTTP 404');
    });

    it('en "auto" acepta 1.6 y prefiere 2.0.1 si el equipo ofrece las dos', async () => {
      await registrar('AUTO-1');
      const solo16 = await conectar('AUTO-1', ['ocpp1.6']);
      expect(solo16.protocolo).toBe('ocpp1.6');
      await solo16.cerrar();
      const ambas = await conectar('AUTO-1', ['ocpp1.6', 'ocpp2.0.1']);
      expect(ambas.protocolo).toBe('ocpp2.0.1');
    });

    it('un cargador fijado en 1.6 no acepta solo 2.0.1', async () => {
      await registrar('FIJO-16', '1.6');
      await expect(CargadorFalso.conectar(t.puerto, 'FIJO-16', ['ocpp2.0.1'])).rejects.toThrow('HTTP 400');
    });

    it('sin subprotocolo se trata como 1.6 (algunos equipos no lo envían)', async () => {
      await registrar('SIN-PROTO');
      const c = await conectar('SIN-PROTO', []);
      expect((await c.call('Heartbeat', {})).currentTime).toBeDefined();
    });
  });

  describe('OCPP 1.6J', () => {
    const SERIE = 'MDX16';
    let c: CargadorFalso;

    beforeAll(() => registrar(SERIE, '1.6'));
    beforeEach(async () => {
      c = await conectar(SERIE);
      const boot = await c.call('BootNotification', { chargePointVendor: 'MDX', chargePointModel: 'MDXDC3001' });
      expect(boot.status).toBe('Accepted');
      // El MDXDC3001 llega con el reloj en el año 2000: la respuesta trae la hora actual.
      expect(Math.abs(Date.parse(boot.currentTime as string) - Date.now())).toBeLessThan(60_000);
      await c.call('StatusNotification', { connectorId: 1, status: 'Available', errorCode: 'NoError' });
    });

    it('responde FormationViolation a un mensaje mal formado', async () => {
      await expect(c.call('StartTransaction', { connectorId: 1, idTag: 'X' })).rejects.toMatchObject({ codigo: 'FormationViolation' });
    });

    it('StatusNotification Faulted deja el cargador en falla y Available lo recupera', async () => {
      await c.call('StatusNotification', { connectorId: 1, status: 'Faulted', errorCode: 'GroundFailure' });
      expect((await cargador(SERIE)).estado).toBe('en_falla');
      await c.call('StatusNotification', { connectorId: 1, status: 'Available', errorCode: 'NoError' });
      expect((await cargador(SERIE)).estado).toBe('activo');
    });

    it('carga completa desde la app: remoto → medición → detener → cierre y costo', async () => {
      const inicio = await t.http.post('/sesiones').send({ numero_serie: SERIE, usuario_id: 'app@correo.com' });
      expect(inicio.status).toBe(201);
      expect(inicio.body).toMatchObject({ estado: 'iniciando', medicion: 'ocpp' });
      const remoto = await c.esperarComando('RemoteStartTransaction');
      expect(remoto).toEqual({ connectorId: 1, idTag: inicio.body.id_tag });
      expect(String(remoto.idTag).length).toBeLessThanOrEqual(20);

      expect((await c.call('Authorize', { idTag: remoto.idTag })).idTagInfo).toEqual({ status: 'Accepted' });
      const start = await c.call('StartTransaction', { connectorId: 1, idTag: remoto.idTag, meterStart: 1000, timestamp: new Date().toISOString() });
      expect(start.idTagInfo).toEqual({ status: 'Accepted' });
      const txId = start.transactionId as number;
      expect(Number.isInteger(txId) && txId > 0).toBe(true);
      expect((await sesion(inicio.body.id)).estado).toBe('en_curso');

      await c.call('MeterValues', {
        connectorId: 1,
        transactionId: txId,
        meterValue: energia(6000, [
          { value: '30000', measurand: 'Power.Active.Import', unit: 'W' },
          { value: '55', measurand: 'SoC', unit: 'Percent' },
        ]),
      });
      expect(await sesion(inicio.body.id)).toMatchObject({ kwh_consumidos: 5, potencia_kw: 30, soc_pct: 55 });

      const detener = await t.http.post(`/sesiones/${inicio.body.id}/finalizar`).send({});
      expect(detener.body.estado).toBe('deteniendo');
      expect(await c.esperarComando('RemoteStopTransaction')).toEqual({ transactionId: txId });

      await c.call('StopTransaction', { transactionId: txId, meterStop: 13500, timestamp: new Date().toISOString(), reason: 'Remote' });
      const fin = await sesion(inicio.body.id);
      expect(fin).toMatchObject({ estado: 'finalizada', kwh_consumidos: 12.5, costo_total: 12.5 * TARIFA, motivo: 'Detenida (Remote)' });

      const pago = await t.http.post(`/sesiones/${inicio.body.id}/pagar`).send({});
      expect(pago.body.pago).toMatchObject({ monto_total: 14875, comision_plataforma: 1487.5, monto_operador: 13387.5 });
    });

    it('si el cargador rechaza el inicio remoto, la sesión queda fallida', async () => {
      c.responder = (accion) => (accion === 'RemoteStartTransaction' ? { status: 'Rejected' } : { status: 'Accepted' });
      const r = await t.http.post('/sesiones').send({ numero_serie: SERIE, usuario_id: 'app@correo.com' });
      expect(r.status).toBe(409);
      const ultima = (await t.http.get('/sesiones').set(bearer(t.token))).body.find((s: any) => s.numero_serie === SERIE);
      expect(ultima.estado).toBe('fallida');
    });

    it('una tarjeta RFID autorizada crea su propia sesión; una desconocida se rechaza', async () => {
      expect((await c.call('Authorize', { idTag: 'NOEXISTE' })).idTagInfo).toEqual({ status: 'Invalid' });
      const mala = await c.call('StartTransaction', { connectorId: 1, idTag: 'NOEXISTE', meterStart: 0 });
      expect(mala).toEqual({ transactionId: 0, idTagInfo: { status: 'Invalid' } });

      const start = await c.call('StartTransaction', { connectorId: 1, idTag: 'TARJ01', meterStart: 50_000 });
      expect(start.idTagInfo).toEqual({ status: 'Accepted' });
      const rfid = (await t.http.get('/sesiones').set(bearer(t.token))).body.find((s: any) => s.transaction_id === start.transactionId);
      expect(rfid).toMatchObject({ origen: 'rfid', usuario_id: 'Tarjeta TARJ01', estado: 'en_curso' });

      await c.call('StopTransaction', { transactionId: start.transactionId, meterStop: 53_000, timestamp: new Date().toISOString() });
      expect(await sesion(rfid.id)).toMatchObject({ estado: 'finalizada', kwh_consumidos: 3 });
    });

    it('una nueva transacción cierra la sesión huérfana anterior con su última lectura', async () => {
      const a = await c.call('StartTransaction', { connectorId: 1, idTag: 'TARJ01', meterStart: 0 });
      await c.call('MeterValues', { connectorId: 1, transactionId: a.transactionId, meterValue: energia(2000) });
      // El cargador se reinició y perdió la transacción: no envía StopTransaction.
      const b = await c.call('StartTransaction', { connectorId: 1, idTag: 'TARJ01', meterStart: 2000 });
      const lista = (await t.http.get('/sesiones').set(bearer(t.token))).body;
      const huerfana = lista.find((s: any) => s.transaction_id === a.transactionId);
      expect(huerfana).toMatchObject({ estado: 'finalizada', kwh_consumidos: 2 });
      expect(huerfana.motivo).toMatch(/otra transacción/);
      await c.call('StopTransaction', { transactionId: b.transactionId, meterStop: 2000 });
    });

    it('sin conexión ni simulación, la app no puede iniciar la carga', async () => {
      await c.cerrar();
      await esperarQue(() => t.http.get('/ocpp/conexiones').set(bearer(t.token)).then((r) => r.body), (l: any[]) => !l.some((x) => x.numero_serie === SERIE && x.conectado !== false));
      const r = await t.http.post('/sesiones').send({ numero_serie: SERIE, usuario_id: 'app@correo.com' });
      expect(r.status).toBe(409);
      expect(r.body.message).toMatch(/no está conectado/);
    });
  });

  describe('OCPP 2.0.1', () => {
    const SERIE = 'MDX201';

    it('carga completa con TransactionEvent (Started → Updated → Ended)', async () => {
      await registrar(SERIE, '2.0.1');
      const c = await conectar(SERIE, ['ocpp2.0.1']);
      expect(c.protocolo).toBe('ocpp2.0.1');
      const boot = await c.call('BootNotification', { reason: 'PowerUp', chargingStation: { model: 'X201', vendorName: 'MDX' } });
      expect(boot.status).toBe('Accepted');
      await c.call('StatusNotification', { timestamp: new Date().toISOString(), connectorStatus: 'Available', evseId: 1, connectorId: 1 });

      const inicio = await t.http.post('/sesiones').send({ numero_serie: SERIE, usuario_id: 'app201@correo.com' });
      expect(inicio.status).toBe(201);
      const remoto = await c.esperarComando('RequestStartTransaction');
      expect(remoto.idToken).toEqual({ idToken: inicio.body.id_tag, type: 'Central' });

      const tx = 'f3a1-2b';
      const evento = (eventType: string, kwh: number, extra: Record<string, unknown> = {}) =>
        c.call('TransactionEvent', {
          eventType,
          timestamp: new Date().toISOString(),
          triggerReason: 'MeterValuePeriodic',
          seqNo: 0,
          transactionInfo: { transactionId: tx, chargingState: eventType === 'Ended' ? 'EVConnected' : 'Charging' },
          evse: { id: 1, connectorId: 1 },
          // Energía en kWh con multiplicador: 2.0.1 usa unitOfMeasure.
          meterValue: [{ timestamp: new Date().toISOString(), sampledValue: [{ value: kwh, measurand: 'Energy.Active.Import.Register', unitOfMeasure: { unit: 'kWh' } }] }],
          ...extra,
        });

      const started = await evento('Started', 100, { idToken: { idToken: remoto.idToken && (remoto.idToken as any).idToken, type: 'Central' } });
      expect(started.idTokenInfo).toEqual({ status: 'Accepted' });
      expect((await sesion(inicio.body.id)).estado).toBe('en_curso');

      await evento('Updated', 104.5);
      expect((await sesion(inicio.body.id)).kwh_consumidos).toBe(4.5);

      expect((await t.http.post(`/sesiones/${inicio.body.id}/finalizar`).send({})).body.estado).toBe('deteniendo');
      expect(await c.esperarComando('RequestStopTransaction')).toEqual({ transactionId: tx });

      await evento('Ended', 110, { transactionInfo: { transactionId: tx, stoppedReason: 'Remote' } });
      expect(await sesion(inicio.body.id)).toMatchObject({ estado: 'finalizada', kwh_consumidos: 10, costo_total: 10 * TARIFA });
    });
  });
});
