import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';
import { AlmacenService } from '../../comun/almacen.service';
import { CargadoresService } from '../cargadores/cargadores.service';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { OperadoresService } from '../operadores/operadores.service';
import { FacturacionService } from '../facturacion/facturacion.service';
import { ManejadorTransacciones, OcppGatewayService } from '../ocpp-gateway/ocpp-gateway.service';

// iniciando: se pidió RemoteStartTransaction y se espera StartTransaction del cargador.
// deteniendo: se pidió RemoteStopTransaction y se espera StopTransaction.
export type EstadoSesion = 'iniciando' | 'en_curso' | 'deteniendo' | 'finalizada' | 'fallida';
const ACTIVAS: EstadoSesion[] = ['iniciando', 'en_curso', 'deteniendo'];

export interface PagoSesion {
  estado_pago: 'pendiente' | 'aprobado' | 'rechazado';
  monto_total: number;
  comision_plataforma: number;
  monto_operador: number;
  porcentaje_comision: number;
  referencia_pasarela: string | null;
  fecha: string;
}

export interface SesionRegistro {
  id: string;
  cargador_id: string;
  numero_serie: string;
  operador_id: string;
  usuario_id: string; // correo/celular del usuario, o "Tarjeta <idTag>" si inició con RFID
  origen: 'app' | 'rfid';
  medicion: 'ocpp' | 'simulada';
  estado: EstadoSesion;
  id_tag: string | null;
  transaction_id: number | null;
  meter_start_wh: number | null;
  potencia_kw: number | null;
  inicio: string;
  fin: string | null;
  kwh_consumidos: number;
  tarifa_por_kwh: number; // congelada al iniciar (COP/kWh)
  costo_total: number | null;
  motivo: string | null; // motivo de fin o de falla
  pago: PagoSesion | null;
}

// Referencia a la proforma de una sesión, para que la app muestre el enlace al documento.
export interface ReferenciaProforma {
  id: string;
  numero: string;
  codigo_verificacion: string;
  estado: 'vigente' | 'anulada';
}

const ESPERA_INICIO_MS = 3 * 60_000; // si el cargador no envía StartTransaction en 3 min, la sesión falla
const PERSISTIR_MEDICION_CADA_MS = 15_000;

// Datos persistidos en data/sesiones.json (ver AlmacenService).
// TODO: reemplazar por el repositorio TypeORM de SesionCarga al conectar PostgreSQL.
@Injectable()
export class SesionesService implements OnModuleInit, ManejadorTransacciones {
  private readonly logger = new Logger(SesionesService.name);
  private readonly sesiones = new Map<string, SesionRegistro>();
  private ultimaPersistencia = 0;
  // Los registra ProformasService (evita la dependencia circular sesiones ↔ proformas).
  private alPagar: ((sesion: SesionRegistro) => void) | null = null;
  private buscarProforma: ((sesion_id: string) => ReferenciaProforma | null) | null = null;

  constructor(
    private readonly almacen: AlmacenService,
    private readonly cargadoresService: CargadoresService,
    private readonly operadoresService: OperadoresService,
    private readonly facturacionService: FacturacionService,
    private readonly configuracion: ConfiguracionService,
    private readonly ocpp: OcppGatewayService,
  ) {
    for (const s of this.almacen.leer<SesionRegistro[]>('sesiones', [])) this.sesiones.set(s.id, s);
  }

  onModuleInit() {
    this.ocpp.registrarManejador(this);
  }

  registrarProformas(ganchos: {
    alPagar: (sesion: SesionRegistro) => void;
    buscarProforma: (sesion_id: string) => ReferenciaProforma | null;
  }) {
    this.alPagar = ganchos.alPagar;
    this.buscarProforma = ganchos.buscarProforma;
  }

  // Datos crudos de una sesión, para generar su proforma.
  registro(id: string): SesionRegistro {
    return { ...this.buscar(id) };
  }

  // ---------- Consultas ----------

  listar(alcance: string | null = null) {
    return [...this.sesiones.values()]
      .filter((s) => !alcance || s.operador_id === alcance)
      .sort((a, b) => Date.parse(b.inicio) - Date.parse(a.inicio))
      .map((s) => this.vista(s));
  }

  obtener(id: string) {
    return this.vista(this.buscar(id));
  }

  // ---------- Ciclo de vida de una carga iniciada desde la app ----------

  async iniciar(data: { cargador_id?: string; numero_serie?: string; usuario_id: string }) {
    const usuario_id = data.usuario_id?.trim();
    if (!usuario_id) throw new BadRequestException('Indica un correo o celular para identificar la carga');

    const cargador = data.numero_serie
      ? this.cargadoresService.findByNumeroSerie(data.numero_serie)
      : this.cargadoresService.findById(data.cargador_id ?? '');

    if (cargador.estado !== 'activo') throw new ConflictException('El cargador no está disponible en este momento');
    if (cargador.tarifa_por_kwh == null) throw new ConflictException('El cargador aún no tiene tarifa configurada');
    if (this.activaDe(cargador.id)) throw new ConflictException('El cargador ya tiene una carga en curso');

    const conectado = this.ocpp.estaConectado(cargador.numero_serie);
    if (!conectado && !this.configuracion.obtener().simular_medicion) {
      throw new ConflictException('El cargador no está conectado a la plataforma. Inténtalo en unos minutos.');
    }

    const sesion: SesionRegistro = {
      id: randomUUID(),
      cargador_id: cargador.id,
      numero_serie: cargador.numero_serie,
      operador_id: cargador.operador_id,
      usuario_id,
      origen: 'app',
      medicion: conectado ? 'ocpp' : 'simulada',
      estado: conectado ? 'iniciando' : 'en_curso',
      // idTag único de la sesión (OCPP 1.6 admite máx. 20 caracteres): el cargador lo devuelve en StartTransaction.
      id_tag: conectado ? `APP${randomBytes(4).toString('hex').toUpperCase()}` : null,
      transaction_id: null,
      meter_start_wh: null,
      potencia_kw: null,
      inicio: new Date().toISOString(),
      fin: null,
      kwh_consumidos: 0,
      tarifa_por_kwh: cargador.tarifa_por_kwh,
      costo_total: null,
      motivo: null,
      pago: null,
    };
    this.sesiones.set(sesion.id, sesion);
    this.persistir();

    if (conectado) {
      const respuesta = await this.ocpp
        .enviarComando(cargador.numero_serie, 'RemoteStartTransaction', { connectorId: 1, idTag: sesion.id_tag })
        .catch((e: Error) => ({ tipo: 'CALLERROR' as const, codigo: 'Error', descripcion: e.message, detalles: null }));
      const aceptado = respuesta.tipo === 'CALLRESULT' && respuesta.payload.status === 'Accepted';
      if (!aceptado) {
        this.fallar(sesion, 'El cargador rechazó el inicio remoto');
        throw new ConflictException('El cargador no aceptó el inicio. Conecta la pistola a tu vehículo e inténtalo de nuevo.');
      }
    }
    return this.vista(sesion);
  }

  // Detener desde la app o el panel. Con OCPP se pide RemoteStopTransaction y la sesión
  // se cierra cuando el cargador envía StopTransaction con la lectura final.
  async finalizar(id: string, kwh_consumidos?: number) {
    const sesion = this.buscar(id);
    this.revisarVencimientos(sesion);

    if (sesion.estado === 'deteniendo') return this.vista(sesion);
    if (sesion.estado === 'iniciando') {
      this.fallar(sesion, 'Cancelada antes de que el cargador iniciara la carga');
      return this.vista(sesion);
    }
    if (sesion.estado !== 'en_curso') throw new ConflictException('La sesión ya no está en curso');

    if (sesion.medicion === 'ocpp' && sesion.transaction_id != null && this.ocpp.estaConectado(sesion.numero_serie)) {
      sesion.estado = 'deteniendo';
      this.persistir();
      const respuesta = await this.ocpp
        .enviarComando(sesion.numero_serie, 'RemoteStopTransaction', { transactionId: sesion.transaction_id })
        .catch((e: Error) => ({ tipo: 'CALLERROR' as const, codigo: 'Error', descripcion: e.message, detalles: null }));
      if (respuesta.tipo !== 'CALLRESULT' || respuesta.payload.status !== 'Accepted') {
        if (sesion.estado === 'deteniendo') sesion.estado = 'en_curso';
        this.persistir();
        throw new ConflictException('El cargador no aceptó la orden de detener. Inténtalo de nuevo.');
      }
      return this.vista(sesion);
    }

    // Simulada, o el cargador se desconectó: se cierra con la última medición disponible.
    this.actualizarSimulacion(sesion);
    if (kwh_consumidos !== undefined && kwh_consumidos !== null) {
      const kwh = Number(kwh_consumidos);
      if (!Number.isFinite(kwh) || kwh < 0) throw new BadRequestException('kWh inválidos');
      sesion.kwh_consumidos = kwh;
    }
    this.cerrar(sesion, new Date().toISOString(), 'Detenida por el usuario');
    return this.vista(sesion);
  }

  async pagar(id: string) {
    const sesion = this.buscar(id);
    if (sesion.estado !== 'finalizada' || sesion.costo_total == null) {
      throw new ConflictException('Solo se puede pagar una carga finalizada');
    }
    if (sesion.pago) return this.vista(sesion); // idempotente: no cobrar dos veces

    const operador = this.operadoresService.findOne(sesion.operador_id);
    const resultado = await this.facturacionService.cobrarYDispersar({
      monto_total: sesion.costo_total,
      comision_pactada: operador.comision_pactada,
      cuenta_beneficiario: operador.cuenta_beneficiario,
    });
    sesion.pago = { ...resultado, fecha: new Date().toISOString() };
    this.persistir();
    // La proforma se genera con el pago; si falla, el pago ya quedó registrado y se puede
    // generar después desde el panel.
    try {
      this.alPagar?.(sesion);
    } catch (e) {
      this.logger.error(`No se pudo generar la proforma de la sesión ${sesion.id}: ${(e as Error).message}`);
    }
    return this.vista(sesion);
  }

  verificarAlcance(id: string, alcance: string | null) {
    if (alcance && this.buscar(id).operador_id !== alcance) throw new ForbiddenException('No tienes acceso a esta sesión');
  }

  // ---------- Eventos que llegan del cargador por OCPP ----------

  autorizarIdTag(numero_serie: string, idTag: string) {
    return [...this.sesiones.values()].some(
      (s) => s.numero_serie === numero_serie && s.id_tag === idTag && s.estado === 'iniciando',
    );
  }

  alIniciarTransaccion(d: { numero_serie: string; transactionId: number; connectorId: number; idTag: string; meterStartWh: number; fecha: string }) {
    const pendiente = [...this.sesiones.values()].find(
      (s) => s.numero_serie === d.numero_serie && s.id_tag === d.idTag && s.estado === 'iniciando',
    );

    // El cargador tiene un solo conector: si arranca otra transacción, cualquier sesión OCPP
    // que siguiera abierta en él quedó huérfana (reinicio, corte de red). Se cierra con su última lectura.
    for (const s of this.sesiones.values()) {
      if (s !== pendiente && s.numero_serie === d.numero_serie && s.medicion === 'ocpp' && ['en_curso', 'deteniendo'].includes(s.estado)) {
        this.cerrar(s, new Date().toISOString(), 'Cerrada: el cargador inició otra transacción');
      }
    }

    if (pendiente) {
      Object.assign(pendiente, {
        estado: 'en_curso',
        transaction_id: d.transactionId,
        meter_start_wh: d.meterStartWh,
        inicio: new Date().toISOString(),
      });
      this.persistir();
      return;
    }

    // Carga iniciada en el propio cargador con una tarjeta RFID autorizada.
    if (!this.cargadoresService.existe(d.numero_serie)) return;
    const cargador = this.cargadoresService.findByNumeroSerie(d.numero_serie);
    const sesion: SesionRegistro = {
      id: randomUUID(),
      cargador_id: cargador.id,
      numero_serie: cargador.numero_serie,
      operador_id: cargador.operador_id,
      usuario_id: `Tarjeta ${d.idTag}`,
      origen: 'rfid',
      medicion: 'ocpp',
      estado: 'en_curso',
      id_tag: d.idTag,
      transaction_id: d.transactionId,
      meter_start_wh: d.meterStartWh,
      potencia_kw: null,
      inicio: new Date().toISOString(),
      fin: null,
      kwh_consumidos: 0,
      tarifa_por_kwh: cargador.tarifa_por_kwh ?? 0,
      costo_total: null,
      motivo: null,
      pago: null,
    };
    this.sesiones.set(sesion.id, sesion);
    this.persistir();
  }

  alMedir(d: { numero_serie: string; transactionId: number | null; energiaWh: number | null; potenciaKw: number | null }) {
    const sesion = [...this.sesiones.values()].find(
      (s) =>
        s.numero_serie === d.numero_serie &&
        ACTIVAS.includes(s.estado) &&
        (d.transactionId == null || s.transaction_id === d.transactionId),
    );
    if (!sesion || sesion.meter_start_wh == null) return;
    if (d.energiaWh != null) sesion.kwh_consumidos = this.kwhDesde(sesion.meter_start_wh, d.energiaWh);
    if (d.potenciaKw != null) sesion.potencia_kw = Number(d.potenciaKw.toFixed(2));
    if (Date.now() - this.ultimaPersistencia > PERSISTIR_MEDICION_CADA_MS) this.persistir();
  }

  alDetenerTransaccion(d: { numero_serie: string; transactionId: number; meterStopWh: number; fecha: string; motivo: string | null }) {
    const sesion = [...this.sesiones.values()].find(
      (s) => s.numero_serie === d.numero_serie && s.transaction_id === d.transactionId,
    );
    if (!sesion || !ACTIVAS.includes(sesion.estado)) return;
    if (sesion.meter_start_wh != null) sesion.kwh_consumidos = this.kwhDesde(sesion.meter_start_wh, d.meterStopWh);
    this.cerrar(sesion, new Date().toISOString(), d.motivo ? `Detenida (${d.motivo})` : 'Detenida en el cargador');
  }

  // ---------- Estadísticas para el dashboard ----------

  estadisticas(alcance: string | null, dias = 14) {
    const zona = 'America/Bogota';
    const diaLocal = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: zona });
    const lista = [...this.sesiones.values()].filter((s) => !alcance || s.operador_id === alcance);
    const finalizadas = lista.filter((s) => s.estado === 'finalizada');

    const hoy = Date.now();
    const porDia = new Map<string, { fecha: string; kwh: number; ingresos: number; sesiones: number }>();
    for (let i = dias - 1; i >= 0; i--) {
      const fecha = diaLocal(new Date(hoy - i * 86_400_000).toISOString());
      porDia.set(fecha, { fecha, kwh: 0, ingresos: 0, sesiones: 0 });
    }
    const porCargador = new Map<string, { numero_serie: string; kwh: number; ingresos: number; sesiones: number }>();

    let comision = 0;
    for (const s of finalizadas) {
      const ingresos = s.costo_total ?? 0;
      const dia = porDia.get(diaLocal(s.fin ?? s.inicio));
      if (dia) {
        dia.kwh += s.kwh_consumidos;
        dia.ingresos += ingresos;
        dia.sesiones += 1;
      }
      const c = porCargador.get(s.numero_serie) ?? { numero_serie: s.numero_serie, kwh: 0, ingresos: 0, sesiones: 0 };
      c.kwh += s.kwh_consumidos;
      c.ingresos += ingresos;
      c.sesiones += 1;
      porCargador.set(s.numero_serie, c);
      comision += s.pago?.comision_plataforma ?? 0;
    }

    const redondear = <T extends { kwh: number; ingresos: number }>(x: T) => ({
      ...x,
      kwh: Number(x.kwh.toFixed(3)),
      ingresos: Math.round(x.ingresos),
    });

    return {
      totales: {
        sesiones: finalizadas.length,
        en_curso: lista.filter((s) => ACTIVAS.includes(s.estado)).length,
        kwh: Number(finalizadas.reduce((t, s) => t + s.kwh_consumidos, 0).toFixed(3)),
        ingresos: Math.round(finalizadas.reduce((t, s) => t + (s.costo_total ?? 0), 0)),
        comision_plataforma: Math.round(comision),
        pagos_pendientes: finalizadas.filter((s) => !s.pago || s.pago.estado_pago === 'pendiente').length,
      },
      por_dia: [...porDia.values()].map(redondear),
      por_cargador: [...porCargador.values()].map(redondear).sort((a, b) => b.kwh - a.kwh),
    };
  }

  // ---------- Internos ----------

  private buscar(id: string): SesionRegistro {
    const sesion = this.sesiones.get(id);
    if (!sesion) throw new NotFoundException(`No existe la sesión ${id}`);
    return sesion;
  }

  private activaDe(cargador_id: string) {
    return [...this.sesiones.values()].find((s) => {
      if (s.cargador_id !== cargador_id) return false;
      this.revisarVencimientos(s);
      return ACTIVAS.includes(s.estado);
    });
  }

  private kwhDesde(inicioWh: number, actualWh: number) {
    return Math.max(0, Number(((actualWh - inicioWh) / 1000).toFixed(3)));
  }

  // Sesiones que quedaron colgadas porque el cargador no respondió o se desconectó.
  private revisarVencimientos(s: SesionRegistro) {
    if (s.estado === 'iniciando' && Date.now() - Date.parse(s.inicio) > ESPERA_INICIO_MS) {
      this.fallar(s, 'El cargador no inició la carga a tiempo');
    }
    if (s.estado === 'deteniendo' && !this.ocpp.estaConectado(s.numero_serie)) {
      this.cerrar(s, new Date().toISOString(), 'El cargador se desconectó; se usó la última lectura');
    }
  }

  private actualizarSimulacion(s: SesionRegistro) {
    if (s.medicion !== 'simulada' || s.estado !== 'en_curso') return;
    const horas = (Date.now() - Date.parse(s.inicio)) / 3_600_000;
    const potencia = this.configuracion.obtener().potencia_simulada_kw;
    s.kwh_consumidos = Number((horas * potencia).toFixed(3));
    s.potencia_kw = potencia;
  }

  private cerrar(s: SesionRegistro, fin: string, motivo: string) {
    s.estado = 'finalizada';
    s.fin = fin;
    s.motivo = motivo;
    s.potencia_kw = null;
    s.costo_total = this.facturacionService.calcularCosto(s.kwh_consumidos, s.tarifa_por_kwh);
    this.persistir();
  }

  private fallar(s: SesionRegistro, motivo: string) {
    s.estado = 'fallida';
    s.fin = new Date().toISOString();
    s.motivo = motivo;
    s.potencia_kw = null;
    this.persistir();
  }

  private vista(s: SesionRegistro) {
    this.revisarVencimientos(s);
    this.actualizarSimulacion(s);
    const costo_estimado = this.facturacionService.calcularCosto(s.kwh_consumidos, s.tarifa_por_kwh);
    return {
      ...s,
      costo_estimado,
      medicion_simulada: s.medicion === 'simulada',
      cargador_conectado: this.ocpp.estaConectado(s.numero_serie),
      proforma: this.buscarProforma?.(s.id) ?? null,
    };
  }

  private persistir() {
    this.ultimaPersistencia = Date.now();
    this.almacen.guardar('sesiones', [...this.sesiones.values()]);
  }
}
