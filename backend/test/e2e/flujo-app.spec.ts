// Flujo completo por HTTP con la medición simulada (cargador sin conexión OCPP):
// empresa → cargador → carga desde el QR → detener → pagar → comisión → proforma → puntos.
import { AppDePrueba, bearer, crearApp } from '../apoyo/app';

describe('Flujo de la app (medición simulada)', () => {
  let t: AppDePrueba;
  let empresa: { id: string };
  let empresaSinComision: { id: string };

  beforeAll(async () => {
    t = await crearApp();
    empresa = (await t.http.post('/operadores').set(bearer(t.token)).send({ nombre: 'EV Norte', nit: '900.123.456-7', comision_pactada: 15 })).body;
    empresaSinComision = (await t.http.post('/operadores').set(bearer(t.token)).send({ nombre: 'EV Sur' })).body;
    for (const [serie, operador_id] of [['MDX-A', empresa.id], ['MDX-B', empresaSinComision.id]]) {
      const r = await t.http.post('/cargadores').set(bearer(t.token)).send({ numero_serie: serie, operador_id, tarifa_por_kwh: 1190 });
      expect(r.status).toBe(201);
    }
  });

  afterAll(() => t.cerrar());

  // Carga completa desde la app con kWh fijos (la simulación los calcula por tiempo).
  async function cargar(serie: string, kwh: number, token?: string) {
    const conToken = (r: ReturnType<typeof t.http.post>) => (token ? r.set(bearer(token)) : r);
    const inicio = await conToken(t.http.post('/sesiones')).send({ numero_serie: serie, usuario_id: 'conductor@correo.com' });
    expect(inicio.status).toBe(201);
    const fin = await t.http.post(`/sesiones/${inicio.body.id}/finalizar`).send({ kwh_consumidos: kwh });
    expect(fin.status).toBe(200);
    return fin.body;
  }

  describe('autenticación', () => {
    it('rechaza las rutas del panel sin token', async () => {
      expect((await t.http.get('/sesiones')).status).toBe(401);
      expect((await t.http.get('/operadores')).status).toBe(401);
    });

    it('rechaza credenciales incorrectas', async () => {
      expect((await t.http.post('/auth/login').send({ email: 'admin@pruebas.local', password: 'mala' })).status).toBe(401);
    });

    it('deja ver el cargador sin login (pantalla del QR)', async () => {
      const r = await t.http.get('/cargadores/MDX-A');
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ numero_serie: 'MDX-A', operador_nombre: 'EV Norte', tarifa_por_kwh: 1190 });
    });
  });

  describe('cargadores', () => {
    it('no permite números de serie repetidos ni inválidos', async () => {
      const repetido = await t.http.post('/cargadores').set(bearer(t.token)).send({ numero_serie: 'MDX-A', operador_id: empresa.id });
      expect(repetido.status).toBe(409);
      const invalido = await t.http.post('/cargadores').set(bearer(t.token)).send({ numero_serie: 'con espacio', operador_id: empresa.id });
      expect(invalido.status).toBe(400);
    });

    it('no inicia una carga en un cargador sin tarifa', async () => {
      await t.http.post('/cargadores').set(bearer(t.token)).send({ numero_serie: 'SIN-TARIFA', operador_id: empresa.id });
      const r = await t.http.post('/sesiones').send({ numero_serie: 'SIN-TARIFA', usuario_id: 'x@y.co' });
      expect(r.status).toBe(409);
      expect(r.body.message).toMatch(/tarifa/);
    });
  });

  describe('sesión, pago y comisión', () => {
    let sesionId: string;

    it('inicia la carga y no deja iniciar otra en el mismo cargador', async () => {
      const r = await t.http.post('/sesiones').send({ numero_serie: 'MDX-A', usuario_id: '3001234567' });
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ estado: 'en_curso', medicion: 'simulada', origen: 'app', tarifa_por_kwh: 1190 });
      sesionId = r.body.id;

      const otra = await t.http.post('/sesiones').send({ numero_serie: 'MDX-A', usuario_id: 'otro@correo.com' });
      expect(otra.status).toBe(409);
    });

    it('no permite pagar una carga en curso', async () => {
      expect((await t.http.post(`/sesiones/${sesionId}/pagar`).send({})).status).toBe(409);
    });

    it('al detener calcula el costo con la tarifa congelada', async () => {
      // Cambiar la tarifa durante la carga no afecta a la sesión ya iniciada.
      await t.http.patch('/cargadores/MDX-A').set(bearer(t.token)).send({ tarifa_por_kwh: 2000 });
      const r = await t.http.post(`/sesiones/${sesionId}/finalizar`).send({ kwh_consumidos: 10 });
      expect(r.body).toMatchObject({ estado: 'finalizada', kwh_consumidos: 10, costo_total: 11900 });
      await t.http.patch('/cargadores/MDX-A').set(bearer(t.token)).send({ tarifa_por_kwh: 1190 });
    });

    it('rechaza kWh negativos', async () => {
      const inicio = await t.http.post('/sesiones').send({ numero_serie: 'MDX-B', usuario_id: 'a@b.co' });
      const r = await t.http.post(`/sesiones/${inicio.body.id}/finalizar`).send({ kwh_consumidos: -1 });
      expect(r.status).toBe(400);
      await t.http.post(`/sesiones/${inicio.body.id}/finalizar`).send({ kwh_consumidos: 0 });
    });

    it('reparte con la comisión pactada de la empresa (15 %)', async () => {
      const r = await t.http.post(`/sesiones/${sesionId}/pagar`).send({});
      expect(r.status).toBe(200);
      expect(r.body.pago).toMatchObject({
        estado_pago: 'pendiente',
        monto_total: 11900,
        comision_plataforma: 1785,
        monto_operador: 10115,
        porcentaje_comision: 15,
      });
    });

    it('pagar dos veces no cobra dos veces', async () => {
      const antes = (await t.http.get(`/sesiones/${sesionId}`)).body.pago;
      const r = await t.http.post(`/sesiones/${sesionId}/pagar`).send({});
      expect(r.body.pago).toEqual(antes);
    });

    it('usa la comisión por defecto (20 %) si la empresa no tiene una pactada', async () => {
      const s = await cargar('MDX-B', 5);
      const r = await t.http.post(`/sesiones/${s.id}/pagar`).send({});
      expect(r.body.pago).toMatchObject({ monto_total: 5950, comision_plataforma: 1190, monto_operador: 4760, porcentaje_comision: 20 });
    });

    it('un administrador de empresa no ve las sesiones de otra', async () => {
      const reg = await t.http.post('/auth/registro').send({ empresa: 'Ajena SAS', nombre: 'Ana', email: 'ana@ajena.co', password: 'clave-segura-1' });
      expect(reg.status).toBe(201);
      const lista = await t.http.get('/sesiones').set(bearer(reg.body.token));
      expect(lista.status).toBe(200);
      expect(lista.body).toEqual([]);
      const todas = await t.http.get('/sesiones').set(bearer(t.token));
      expect(todas.body.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('proformas', () => {
    let proforma: any;

    it('se emite sola al pagar, con consecutivo y el IVA desagregado', async () => {
      const lista = await t.http.get('/proformas').set(bearer(t.token));
      expect(lista.status).toBe(200);
      const deMdxA = lista.body.find((p: any) => p.numero_serie === 'MDX-A');
      expect(deMdxA).toBeDefined();
      expect(deMdxA.numero).toMatch(/^PF-\d{6}$/);

      proforma = (await t.http.get(`/proformas/${deMdxA.id}`).set(bearer(t.token))).body;
      expect(proforma.origen).toBe('automatica');
      expect(proforma.cliente.documento).toBe('222222222222'); // consumidor final
      // $11.900 con IVA del 19 % → subtotal 10.000 + IVA 1.900
      expect(proforma.totales).toMatchObject({ subtotal: 10000, iva: 1900, total: 11900, total_neto: 11900, iva_porcentaje: 19 });
      expect(proforma.valor_en_letras).toBe('ONCE MIL NOVECIENTOS PESOS M/CTE');
    });

    it('los consecutivos no se repiten', async () => {
      const lista = (await t.http.get('/proformas').set(bearer(t.token))).body as { numero: string }[];
      expect(new Set(lista.map((p) => p.numero)).size).toBe(lista.length);
    });

    it('se puede verificar sin login con el código del QR', async () => {
      const r = await t.http.get(`/proformas/verificar/${proforma.codigo_verificacion}`);
      expect(r.status).toBe(200);
      expect(r.body.numero).toBe(proforma.numero);
      expect((await t.http.get('/proformas/verificar/000000000000')).status).toBe(404);
    });

    it('al anular conserva el número', async () => {
      const r = await t.http.post(`/proformas/${proforma.id}/anular`).set(bearer(t.token)).send({ motivo: 'Prueba de anulación' });
      expect(r.status).toBe(200);
      const despues = (await t.http.get(`/proformas/${proforma.id}`).set(bearer(t.token))).body;
      expect(despues).toMatchObject({ estado: 'anulada', numero: proforma.numero });
    });
  });

  describe('app del conductor y puntos', () => {
    let token: string;

    it('registra al conductor y valida la clave', async () => {
      const r = await t.http.post('/conductor/registro').send({ nombre: 'Laura', email: 'laura@correo.com', password: 'clave-larga-1' });
      expect(r.status).toBe(201);
      token = r.body.token;
      expect((await t.http.post('/conductor/login').send({ email: 'laura@correo.com', password: 'otra-clave' })).status).toBe(401);
      expect((await t.http.post('/conductor/registro').send({ nombre: 'X', email: 'x@y.co', password: '123' })).status).toBe(400);
    });

    it('el token del conductor no abre el panel', async () => {
      expect((await t.http.get('/sesiones').set(bearer(token))).status).toBe(401);
    });

    it('acumula puntos al pagar una carga hecha con su cuenta', async () => {
      const s = await cargar('MDX-A', 25, token);
      expect(s.conductor_id).toBeTruthy();
      const pago = await t.http.post(`/sesiones/${s.id}/pagar`).set(bearer(token)).send({});
      expect(pago.body.puntos_ganados).toBe(25); // 1 punto por kWh

      const resumen = (await t.http.get('/conductor/puntos').set(bearer(token))).body;
      expect(resumen).toMatchObject({ saldo_total: 25, valor_total_cop: 1250 });
      expect((await t.http.get('/conductor/cargas').set(bearer(token))).body).toHaveLength(1);
    });

    it('no deja usar puntos en una carga ajena', async () => {
      const s = await cargar('MDX-A', 2);
      const r = await t.http.post(`/sesiones/${s.id}/pagar`).set(bearer(token)).send({ usar_puntos: true });
      expect(r.status).toBe(409);
    });

    it('redime los puntos como descuento y la comisión se calcula sobre lo cobrado', async () => {
      const s = await cargar('MDX-A', 10, token); // $11.900
      const r = await t.http.post(`/sesiones/${s.id}/pagar`).set(bearer(token)).send({ usar_puntos: true });
      expect(r.status).toBe(200);
      expect(r.body.descuento_puntos).toEqual({ puntos: 25, valor: 1250 });
      // 11.900 − 1.250 = 10.650; 15 % = 1.597,5
      expect(r.body.pago).toMatchObject({ monto_total: 10650, comision_plataforma: 1597.5, monto_operador: 9052.5 });
      expect(r.body.puntos_ganados).toBe(10);

      const resumen = (await t.http.get('/conductor/puntos').set(bearer(token))).body;
      expect(resumen).toMatchObject({ saldo_total: 10, ahorro_cop: 1250 });
    });

    it('los puntos de una empresa no aplican en cargadores de otra', async () => {
      const programa = (await t.http.get('/conductor/programa/MDX-B').set(bearer(token))).body;
      expect(programa).toMatchObject({ saldo: 0, puede_redimir: false });
    });
  });

  describe('dashboard', () => {
    it('suma energía, ingresos y comisión de las cargas finalizadas', async () => {
      const r = await t.http.get('/estadisticas?dias=7').set(bearer(t.token));
      expect(r.status).toBe(200);
      const { totales, por_dia } = r.body;
      expect(por_dia).toHaveLength(7);
      const sesiones = (await t.http.get('/sesiones').set(bearer(t.token))).body.filter((s: any) => s.estado === 'finalizada');
      expect(totales.sesiones).toBe(sesiones.length);
      expect(totales.kwh).toBeCloseTo(sesiones.reduce((a: number, s: any) => a + s.kwh_consumidos, 0), 3);
      expect(totales.en_curso).toBe(0);
    });
  });

  describe('persistencia', () => {
    it('guarda las colecciones en DATA_DIR', async () => {
      const fs = await import('fs');
      for (const archivo of ['operadores.json', 'cargadores.json', 'sesiones.json', 'proformas.json', 'puntos.json']) {
        expect(fs.existsSync(`${t.carpeta}/${archivo}`)).toBe(true);
      }
    });
  });
});
