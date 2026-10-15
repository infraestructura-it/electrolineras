import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  OnModuleDestroy,
  RequestTimeoutException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { IncomingMessage, Server } from 'http';
import type { Duplex } from 'stream';
import { WebSocket, WebSocketServer, RawData } from 'ws';
import { AlmacenService } from '../../comun/almacen.service';
import { CargadoresService, EstadoCargador } from '../cargadores/cargadores.service';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { CATALOGOS, validarComando, VersionProtocolo } from './ocpp-comandos';

// Gateway OCPP (sistema central / CSMS) para cargadores como el MDXDC3001. Habla OCPP 1.6J y 2.0.1:
// la versión se negocia con el subprotocolo del WebSocket ("ocpp1.6" / "ocpp2.0.1") según lo que
// permita el cargador en la plataforma (version_ocpp: auto, 1.6 o 2.0.1).
// El cargador se conecta por WebSocket a  ws(s)://<servidor>:<puerto>/ocpp/<pile_number>
// (en el equipo: domain_master = ws://<servidor>:3000/ocpp y pile_number_master = numero_serie).
//
// Mensajes OCPP-J: CALL [2, id, acción, payload] · CALLRESULT [3, id, payload] · CALLERROR [4, id, código, descripción, detalles]

const RUTA_OCPP = '/ocpp';
const TIEMPO_ESPERA_RESPUESTA_MS = 30_000;
const VIGENCIA_IDTAG_REMOTO_MS = 5 * 60_000;
const MAX_MENSAJES_REGISTRO = 1000;
const SUBPROTOCOLO: Record<VersionProtocolo, string> = { '1.6': 'ocpp1.6', '2.0.1': 'ocpp2.0.1' };

type Direccion = 'entrada' | 'salida' | 'sistema';

export interface MensajeOcpp {
  id: number;
  fecha: string;
  numero_serie: string;
  direccion: Direccion;
  tipo: 'CALL' | 'CALLRESULT' | 'CALLERROR' | 'EVENTO';
  accion: string | null;
  mensaje_id: string | null;
  payload: unknown;
}

interface EstadoConector {
  status: string;
  errorCode: string;
  info: string | null;
  fecha: string;
}

interface Conexion {
  numero_serie: string;
  ws: WebSocket;
  ip: string | null;
  protocolo: string;
  version: VersionProtocolo;
  conectado_desde: string;
  ultimo_mensaje: string;
  ultimo_heartbeat: string | null;
  boot: Record<string, unknown> | null;
  boot_aceptado: boolean;
  conectores: Map<number, EstadoConector>;
}

interface LlamadaPendiente {
  accion: string;
  numero_serie: string;
  resolver: (r: RespuestaComando) => void;
  rechazar: (e: Error) => void;
  temporizador: NodeJS.Timeout;
}

export type RespuestaComando =
  | { tipo: 'CALLRESULT'; payload: Record<string, unknown> }
  | { tipo: 'CALLERROR'; codigo: string; descripcion: string; detalles: unknown };

class ErrorOcpp extends Error {
  constructor(
    readonly codigo: string,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

// Lo implementa SesionesService para enlazar transacciones OCPP con sesiones de carga.
export interface ManejadorTransacciones {
  autorizarIdTag(numero_serie: string, idTag: string): boolean;
  alIniciarTransaccion(d: {
    numero_serie: string;
    transactionId: number | string; // 1.6: entero que asigna el servidor; 2.0.1: texto que asigna el cargador
    connectorId: number;
    idTag: string;
    meterStartWh: number | null; // null: se toma de la primera medición
    fecha: string;
    // 'panel' si la carga la ordenó un admin con RemoteStartTransaction desde la consola OCPP.
    origen: 'rfid' | 'panel';
  }): void;
  alMedir(d: {
    numero_serie: string;
    transactionId: number | string | null;
    energiaWh: number | null;
    potenciaKw: number | null;
    socPct: number | null;
  }): void;
  alDetenerTransaccion(d: {
    numero_serie: string;
    transactionId: number | string;
    meterStopWh: number | null; // null: se conserva la última medición
    fecha: string;
    motivo: string | null;
  }): void;
}

// Estados de conector de 2.0.1 (connectorStatus / chargingState) traducidos al vocabulario de 1.6
// para que el resto de la plataforma use una sola lista.
const STATUS_201: Record<string, string> = {
  Available: 'Available',
  Occupied: 'Preparing',
  Reserved: 'Reserved',
  Unavailable: 'Unavailable',
  Faulted: 'Faulted',
  Charging: 'Charging',
  EVConnected: 'Preparing',
  SuspendedEV: 'SuspendedEV',
  SuspendedEVSE: 'SuspendedEVSE',
  Idle: 'Preparing',
};

const ESTADO_POR_STATUS: Record<string, EstadoCargador> = {
  Faulted: 'en_falla',
  Unavailable: 'inactivo',
};

@Injectable()
export class OcppGatewayService implements OnModuleDestroy {
  private readonly logger = new Logger(OcppGatewayService.name);
  private readonly conexiones = new Map<string, Conexion>();
  private readonly pendientes = new Map<string, LlamadaPendiente>();
  // idTag enviados desde la consola con RemoteStartTransaction, por cargador. El servidor los
  // acepta en el Authorize/StartTransaction que sigue (vencen a los 5 minutos).
  private readonly idTagsRemotos = new Map<string, { idTag: string; vence: number }>();
  private readonly registro: MensajeOcpp[] = [];
  private secuenciaRegistro = 0;
  private ultimoTransactionId: number;
  private remoteStartId = Math.floor(Date.now() / 1000) % 1_000_000;
  private manejador: ManejadorTransacciones | null = null;
  private wss: WebSocketServer | null = null;

  constructor(
    private readonly cargadores: CargadoresService,
    private readonly configuracion: ConfiguracionService,
    private readonly almacen: AlmacenService,
  ) {
    this.ultimoTransactionId = this.almacen.leer<{ ultimo: number }>('ocpp-transacciones', { ultimo: 0 }).ultimo;
  }

  registrarManejador(manejador: ManejadorTransacciones) {
    this.manejador = manejador;
  }

  // Se engancha al servidor HTTP de Nest (mismo puerto que la API) desde main.ts.
  adjuntar(servidor: Server) {
    this.wss = new WebSocketServer({
      noServer: true,
      handleProtocols: (protocolos, req) => {
        const v = this.elegirVersion(protocolos, this.serieDeRuta(req.url));
        return v ? SUBPROTOCOLO[v] : false;
      },
    });

    servidor.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const ruta = new URL(req.url ?? '/', 'http://localhost').pathname.replace(/\/+$/, '');
      if (!ruta.startsWith(`${RUTA_OCPP}/`)) {
        socket.destroy();
        return;
      }
      const numero_serie = this.serieDeRuta(req.url);
      if (!numero_serie) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
      }
      if (!this.cargadores.existe(numero_serie) && !this.configuracion.obtener().aceptar_cargadores_desconocidos) {
        this.anotar(numero_serie, 'sistema', 'EVENTO', 'ConexionRechazada', null, {
          motivo: 'Cargador no registrado en la plataforma',
          ip: req.socket.remoteAddress,
        });
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
        return;
      }
      const ofrecidos = String(req.headers['sec-websocket-protocol'] ?? '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
      if (!this.elegirVersion(new Set(ofrecidos), numero_serie)) {
        this.anotar(numero_serie, 'sistema', 'EVENTO', 'ConexionRechazada', null, {
          motivo: `Versión OCPP no permitida para este cargador (ofrece: ${ofrecidos.join(', ') || 'ninguna'})`,
          ip: req.socket.remoteAddress,
        });
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
      }
      this.wss!.handleUpgrade(req, socket, head, (ws) => this.alConectar(ws, req, numero_serie));
    });

    this.logger.log(`Gateway OCPP 1.6J / 2.0.1 escuchando en ${RUTA_OCPP}/<numero_serie>`);
  }

  private serieDeRuta(url: string | undefined) {
    const ruta = new URL(url ?? '/', 'http://localhost').pathname.replace(/\/+$/, '');
    return decodeURIComponent(ruta.slice(RUTA_OCPP.length + 1).split('/').pop() ?? '');
  }

  // Versión a usar según lo que ofrece el cargador y lo que permite su registro.
  // 'auto' prefiere 2.0.1 si el equipo la ofrece. Un cargador que no anuncia subprotocolo se
  // trata como 1.6 (algunos equipos 1.6J no lo envían), salvo que esté fijado en 2.0.1.
  private elegirVersion(ofrecidos: Set<string>, numero_serie: string): VersionProtocolo | null {
    const permitida = this.cargadores.existe(numero_serie) ? this.cargadores.findByNumeroSerie(numero_serie).version_ocpp : 'auto';
    const candidatos: VersionProtocolo[] = permitida === 'auto' ? ['2.0.1', '1.6'] : [permitida];
    if (ofrecidos.size === 0) return candidatos.includes('1.6') ? '1.6' : null;
    return candidatos.find((v) => ofrecidos.has(SUBPROTOCOLO[v])) ?? null;
  }

  onModuleDestroy() {
    for (const c of this.conexiones.values()) c.ws.close(1001, 'Servidor detenido');
    this.wss?.close();
  }

  // ---------- Consultas para el panel ----------

  estaConectado(numero_serie: string) {
    return this.conexiones.get(numero_serie)?.ws.readyState === WebSocket.OPEN;
  }

  // Último StatusNotification del conector (null si el cargador no está conectado o no lo ha enviado).
  estadoConector(numero_serie: string, connectorId = 1): { status: string; fecha: string } | null {
    if (!this.estaConectado(numero_serie)) return null;
    const e = this.conexiones.get(numero_serie)?.conectores.get(connectorId);
    return e ? { status: e.status, fecha: e.fecha } : null;
  }

  // Resumen de la conexión de un cargador para el monitor (null = no conectado).
  infoConexion(numero_serie: string) {
    const c = this.conexiones.get(numero_serie);
    if (!c || c.ws.readyState !== WebSocket.OPEN) return null;
    const conector = c.conectores.get(1) ?? c.conectores.get(0) ?? null;
    return {
      ip: c.ip,
      protocolo: c.protocolo,
      version: c.version,
      conectado_desde: c.conectado_desde,
      ultimo_mensaje: c.ultimo_mensaje,
      ultimo_heartbeat: c.ultimo_heartbeat,
      firmware: ((c.boot?.firmwareVersion ?? (c.boot?.chargingStation as Record<string, unknown> | undefined)?.firmwareVersion) as string) ?? null,
      conector: conector ? { status: conector.status, errorCode: conector.errorCode, fecha: conector.fecha } : null,
    };
  }

  listarConexiones(series: string[] | null) {
    return [...this.conexiones.values()]
      .filter((c) => !series || series.includes(c.numero_serie))
      .map((c) => ({
        numero_serie: c.numero_serie,
        ip: c.ip,
        protocolo: c.protocolo,
        version: c.version,
        conectado_desde: c.conectado_desde,
        ultimo_mensaje: c.ultimo_mensaje,
        ultimo_heartbeat: c.ultimo_heartbeat,
        boot: c.boot,
        boot_aceptado: c.boot_aceptado,
        registrado: this.cargadores.existe(c.numero_serie),
        conectores: [...c.conectores.entries()].map(([connectorId, e]) => ({ connectorId, ...e })),
      }));
  }

  mensajes(filtro: { numero_serie?: string; despues_de?: number; limite?: number }) {
    const limite = Math.min(Math.max(filtro.limite ?? 200, 1), MAX_MENSAJES_REGISTRO);
    return this.registro
      .filter((m) => (!filtro.numero_serie || m.numero_serie === filtro.numero_serie) && m.id > (filtro.despues_de ?? 0))
      .slice(-limite);
  }

  catalogo(version: VersionProtocolo = '1.6') {
    return (CATALOGOS[version] ?? CATALOGOS['1.6']).map(({ accion, descripcion, plantilla }) => ({ accion, descripcion, plantilla }));
  }

  versionDe(numero_serie: string): VersionProtocolo | null {
    return this.conexiones.get(numero_serie)?.version ?? null;
  }

  // Inicio y parada remotos con el comando que corresponde a la versión del cargador.
  iniciarRemoto(numero_serie: string, idTag: string) {
    if (this.versionDe(numero_serie) === '2.0.1') {
      return this.enviarComando(numero_serie, 'RequestStartTransaction', {
        idToken: { idToken: idTag, type: 'Central' },
        remoteStartId: ++this.remoteStartId,
        evseId: 1,
      });
    }
    return this.enviarComando(numero_serie, 'RemoteStartTransaction', { connectorId: 1, idTag });
  }

  detenerRemoto(numero_serie: string, transactionId: number | string) {
    if (this.versionDe(numero_serie) === '2.0.1') {
      return this.enviarComando(numero_serie, 'RequestStopTransaction', { transactionId: String(transactionId) });
    }
    return this.enviarComando(numero_serie, 'RemoteStopTransaction', { transactionId: Number(transactionId) });
  }

  // ---------- Comandos del sistema central hacia el cargador ----------

  async enviarComando(numero_serie: string, accion: string, payload: unknown): Promise<RespuestaComando> {
    const conexion = this.conexiones.get(numero_serie);
    if (!conexion || conexion.ws.readyState !== WebSocket.OPEN) {
      throw new ConflictException(`El cargador ${numero_serie} no está conectado por OCPP`);
    }
    const errores = validarComando(accion, payload ?? {}, conexion.version);
    if (errores.length) throw new BadRequestException(`Payload inválido para ${accion}: ${errores.join('; ')}`);

    if (accion === 'RemoteStartTransaction' || accion === 'RequestStartTransaction') {
      const p = payload as { idTag?: string; idToken?: { idToken: string } };
      const idTag = String(p.idTag ?? p.idToken?.idToken);
      this.idTagsRemotos.set(numero_serie, { idTag, vence: Date.now() + VIGENCIA_IDTAG_REMOTO_MS });
    }

    const mensaje_id = randomUUID();
    const respuesta = new Promise<RespuestaComando>((resolver, rechazar) => {
      const temporizador = setTimeout(() => {
        this.pendientes.delete(mensaje_id);
        this.anotar(numero_serie, 'sistema', 'EVENTO', accion, mensaje_id, { motivo: 'Sin respuesta del cargador en 30 s' });
        rechazar(new RequestTimeoutException(`El cargador ${numero_serie} no respondió ${accion} en 30 s`));
      }, TIEMPO_ESPERA_RESPUESTA_MS);
      this.pendientes.set(mensaje_id, { accion, numero_serie, resolver, rechazar, temporizador });
    });

    this.enviar(conexion, [2, mensaje_id, accion, payload ?? {}], accion);
    return respuesta;
  }

  // ---------- Conexión y mensajes entrantes ----------

  private alConectar(ws: WebSocket, req: IncomingMessage, numero_serie: string) {
    const previa = this.conexiones.get(numero_serie);
    if (previa) previa.ws.close(4000, 'Reemplazada por una conexión nueva');

    const ahora = new Date().toISOString();
    const conexion: Conexion = {
      numero_serie,
      ws,
      ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || null,
      protocolo: ws.protocol || '(sin subprotocolo)',
      version: ws.protocol === SUBPROTOCOLO['2.0.1'] ? '2.0.1' : '1.6',
      conectado_desde: ahora,
      ultimo_mensaje: ahora,
      ultimo_heartbeat: null,
      boot: null,
      boot_aceptado: false,
      conectores: new Map(),
    };
    this.conexiones.set(numero_serie, conexion);
    this.anotar(numero_serie, 'sistema', 'EVENTO', 'Conectado', null, {
      ip: conexion.ip,
      protocolo: conexion.protocolo,
      version: conexion.version,
    });

    ws.on('message', (datos: RawData) => this.alRecibir(conexion, datos.toString()));
    ws.on('close', (codigo: number) => {
      if (this.conexiones.get(numero_serie) === conexion) this.conexiones.delete(numero_serie);
      this.anotar(numero_serie, 'sistema', 'EVENTO', 'Desconectado', null, { codigo });
      for (const [id, p] of this.pendientes) {
        if (p.numero_serie !== numero_serie) continue;
        clearTimeout(p.temporizador);
        this.pendientes.delete(id);
        p.rechazar(new ConflictException(`El cargador ${numero_serie} se desconectó antes de responder ${p.accion}`));
      }
    });
    ws.on('error', (e: Error) => this.logger.warn(`Error de WebSocket con ${numero_serie}: ${e.message}`));
  }

  private alRecibir(conexion: Conexion, texto: string) {
    conexion.ultimo_mensaje = new Date().toISOString();
    let mensaje: unknown;
    try {
      mensaje = JSON.parse(texto);
    } catch {
      this.anotar(conexion.numero_serie, 'entrada', 'EVENTO', 'MensajeInvalido', null, { texto: texto.slice(0, 500) });
      return;
    }
    if (!Array.isArray(mensaje) || typeof mensaje[1] !== 'string') {
      this.anotar(conexion.numero_serie, 'entrada', 'EVENTO', 'MensajeInvalido', null, mensaje);
      return;
    }

    const [tipo, mensaje_id] = mensaje as [number, string];

    if (tipo === 2) {
      const accion = String(mensaje[2]);
      const payload = (mensaje[3] ?? {}) as Record<string, unknown>;
      this.anotar(conexion.numero_serie, 'entrada', 'CALL', accion, mensaje_id, payload);
      try {
        const respuesta = conexion.version === '2.0.1' ? this.atender201(conexion, accion, payload) : this.atender(conexion, accion, payload);
        this.enviar(conexion, [3, mensaje_id, respuesta], accion);
      } catch (e) {
        const error = e instanceof ErrorOcpp ? e : new ErrorOcpp('InternalError', (e as Error).message);
        this.enviar(conexion, [4, mensaje_id, error.codigo, error.message, {}], accion);
      }
      return;
    }

    if (tipo === 3 || tipo === 4) {
      const pendiente = this.pendientes.get(mensaje_id);
      const accion = pendiente?.accion ?? null;
      if (tipo === 3) {
        this.anotar(conexion.numero_serie, 'entrada', 'CALLRESULT', accion, mensaje_id, mensaje[2]);
      } else {
        this.anotar(conexion.numero_serie, 'entrada', 'CALLERROR', accion, mensaje_id, {
          codigo: mensaje[2],
          descripcion: mensaje[3],
          detalles: mensaje[4],
        });
      }
      if (!pendiente) return;
      clearTimeout(pendiente.temporizador);
      this.pendientes.delete(mensaje_id);
      pendiente.resolver(
        tipo === 3
          ? { tipo: 'CALLRESULT', payload: (mensaje[2] ?? {}) as Record<string, unknown> }
          : { tipo: 'CALLERROR', codigo: String(mensaje[2]), descripcion: String(mensaje[3] ?? ''), detalles: mensaje[4] },
      );
    }
  }

  // Respuesta del sistema central a cada mensaje que inicia el cargador.
  private atender(conexion: Conexion, accion: string, p: Record<string, unknown>): Record<string, unknown> {
    const ahora = new Date().toISOString();
    const serie = conexion.numero_serie;
    const exigirTexto = (campo: string) => {
      if (typeof p[campo] !== 'string' || !(p[campo] as string).length) {
        throw new ErrorOcpp('FormationViolation', `Falta "${campo}" en ${accion}`);
      }
      return p[campo] as string;
    };
    const exigirEntero = (campo: string) => {
      if (!Number.isInteger(p[campo])) throw new ErrorOcpp('FormationViolation', `"${campo}" debe ser entero en ${accion}`);
      return p[campo] as number;
    };

    switch (accion) {
      case 'BootNotification': {
        exigirTexto('chargePointVendor');
        exigirTexto('chargePointModel');
        conexion.boot = p;
        const config = this.configuracion.obtener();
        conexion.boot_aceptado = this.cargadores.existe(serie) || config.aceptar_cargadores_desconocidos;
        return {
          status: conexion.boot_aceptado ? 'Accepted' : 'Rejected',
          currentTime: ahora, // sincroniza el reloj del cargador (el MDXDC3001 venía en el año 2000)
          interval: config.intervalo_heartbeat_s,
        };
      }

      case 'Heartbeat':
        conexion.ultimo_heartbeat = ahora;
        return { currentTime: ahora };

      case 'StatusNotification': {
        const connectorId = exigirEntero('connectorId');
        const status = exigirTexto('status');
        conexion.conectores.set(connectorId, {
          status,
          errorCode: String(p.errorCode ?? 'NoError'),
          info: (p.info as string) ?? null,
          fecha: ahora,
        });
        // El conector 0 representa todo el cargador; el MDXDC3001 tiene un solo conector (1).
        if (connectorId <= 1) this.cargadores.actualizarEstadoDesdeOcpp(serie, ESTADO_POR_STATUS[status] ?? 'activo');
        return {};
      }

      case 'Authorize': {
        const idTag = exigirTexto('idTag');
        return { idTagInfo: { status: this.autorizar(serie, idTag) ? 'Accepted' : 'Invalid' } };
      }

      case 'StartTransaction': {
        const idTag = exigirTexto('idTag');
        const connectorId = exigirEntero('connectorId');
        const meterStart = exigirEntero('meterStart');
        if (!this.autorizar(serie, idTag)) {
          return { transactionId: 0, idTagInfo: { status: 'Invalid' } };
        }
        const transactionId = this.siguienteTransactionId();
        const desdePanel = this.esIdTagRemoto(serie, idTag);
        if (desdePanel) this.idTagsRemotos.delete(serie);
        this.manejador?.alIniciarTransaccion({
          origen: desdePanel ? 'panel' : 'rfid',
          numero_serie: serie,
          transactionId,
          connectorId,
          idTag,
          meterStartWh: meterStart,
          fecha: typeof p.timestamp === 'string' ? (p.timestamp as string) : ahora,
        });
        return { transactionId, idTagInfo: { status: 'Accepted' } };
      }

      case 'MeterValues': {
        exigirEntero('connectorId');
        const { energiaWh, potenciaKw, socPct } = this.leerMedicion(p.meterValue);
        this.manejador?.alMedir({
          numero_serie: serie,
          transactionId: Number.isInteger(p.transactionId) ? (p.transactionId as number) : null,
          energiaWh,
          potenciaKw,
          socPct,
        });
        return {};
      }

      case 'StopTransaction': {
        const transactionId = exigirEntero('transactionId');
        const meterStop = exigirEntero('meterStop');
        this.manejador?.alDetenerTransaccion({
          numero_serie: serie,
          transactionId,
          meterStopWh: meterStop,
          fecha: typeof p.timestamp === 'string' ? (p.timestamp as string) : ahora,
          motivo: typeof p.reason === 'string' ? (p.reason as string) : null,
        });
        return { idTagInfo: { status: 'Accepted' } };
      }

      case 'DataTransfer':
        return { status: 'Accepted' };

      case 'DiagnosticsStatusNotification':
      case 'FirmwareStatusNotification':
        return {};

      default:
        throw new ErrorOcpp('NotImplemented', `La acción ${accion} no está implementada en el sistema central`);
    }
  }

  // ---------- OCPP 2.0.1: mensajes que inicia la estación ----------

  private atender201(conexion: Conexion, accion: string, p: Record<string, unknown>): Record<string, unknown> {
    const ahora = new Date().toISOString();
    const serie = conexion.numero_serie;
    const objeto = (campo: string) => {
      const v = p[campo];
      if (typeof v !== 'object' || v === null || Array.isArray(v)) {
        throw new ErrorOcpp('FormatViolation', `Falta "${campo}" en ${accion}`);
      }
      return v as Record<string, unknown>;
    };
    const texto = (o: Record<string, unknown>, campo: string, donde: string) => {
      if (typeof o[campo] !== 'string' || !(o[campo] as string).length) {
        throw new ErrorOcpp('FormatViolation', `Falta "${donde}" en ${accion}`);
      }
      return o[campo] as string;
    };

    switch (accion) {
      case 'BootNotification': {
        const estacion = objeto('chargingStation');
        texto(estacion, 'model', 'chargingStation.model');
        texto(estacion, 'vendorName', 'chargingStation.vendorName');
        conexion.boot = p;
        const config = this.configuracion.obtener();
        conexion.boot_aceptado = this.cargadores.existe(serie) || config.aceptar_cargadores_desconocidos;
        return { currentTime: ahora, interval: config.intervalo_heartbeat_s, status: conexion.boot_aceptado ? 'Accepted' : 'Rejected' };
      }

      case 'Heartbeat':
        conexion.ultimo_heartbeat = ahora;
        return { currentTime: ahora };

      case 'StatusNotification': {
        const status = texto(p, 'connectorStatus', 'connectorStatus');
        const evseId = Number.isInteger(p.evseId) ? (p.evseId as number) : 1;
        this.fijarConector(conexion, evseId, STATUS_201[status] ?? status, 'NoError', null, ahora);
        return {};
      }

      case 'Authorize': {
        const idToken = texto(objeto('idToken'), 'idToken', 'idToken.idToken');
        return { idTokenInfo: { status: this.autorizar(serie, idToken) ? 'Accepted' : 'Invalid' } };
      }

      case 'TransactionEvent': {
        const evento = texto(p, 'eventType', 'eventType');
        const info = objeto('transactionInfo');
        const transactionId = texto(info, 'transactionId', 'transactionInfo.transactionId');
        const idToken = (p.idToken as { idToken?: string } | undefined)?.idToken ?? null;
        const evseId = Number((p.evse as { id?: number } | undefined)?.id ?? 1) || 1;
        const fecha = typeof p.timestamp === 'string' ? (p.timestamp as string) : ahora;
        const { energiaWh, potenciaKw, socPct } = this.leerMedicion(p.meterValue);
        if (typeof info.chargingState === 'string') {
          this.fijarConector(conexion, evseId, STATUS_201[info.chargingState] ?? info.chargingState, 'NoError', null, ahora);
        }

        let idTokenInfo: Record<string, unknown> | undefined;
        if (idToken) {
          const autorizado = this.autorizar(serie, idToken);
          idTokenInfo = { status: autorizado ? 'Accepted' : 'Invalid' };
          // La transacción se enlaza con una sesión cuando llega su idToken (en Started o después).
          if (autorizado && evento !== 'Ended') {
            const desdePanel = this.esIdTagRemoto(serie, idToken);
            if (desdePanel) this.idTagsRemotos.delete(serie);
            this.manejador?.alIniciarTransaccion({
              origen: desdePanel ? 'panel' : 'rfid',
              numero_serie: serie,
              transactionId,
              connectorId: evseId,
              idTag: idToken,
              meterStartWh: energiaWh,
              fecha,
            });
          }
        }

        if (evento === 'Ended') {
          this.fijarConector(conexion, evseId, 'Available', 'NoError', null, ahora);
          this.manejador?.alDetenerTransaccion({
            numero_serie: serie,
            transactionId,
            meterStopWh: energiaWh,
            fecha,
            motivo: typeof info.stoppedReason === 'string' ? (info.stoppedReason as string) : null,
          });
        } else if (energiaWh !== null || potenciaKw !== null || socPct !== null) {
          this.manejador?.alMedir({ numero_serie: serie, transactionId, energiaWh, potenciaKw, socPct });
        }
        return idTokenInfo ? { idTokenInfo } : {};
      }

      case 'MeterValues': {
        const { energiaWh, potenciaKw, socPct } = this.leerMedicion(p.meterValue);
        this.manejador?.alMedir({ numero_serie: serie, transactionId: null, energiaWh, potenciaKw, socPct });
        return {};
      }

      case 'DataTransfer':
        return { status: 'Accepted' };

      // Avisos que se registran en la consola sin más respuesta que la confirmación.
      case 'NotifyEvent':
      case 'NotifyReport':
      case 'SecurityEventNotification':
      case 'LogStatusNotification':
      case 'FirmwareStatusNotification':
      case 'NotifyChargingLimit':
      case 'ClearedChargingLimit':
      case 'ReportChargingProfiles':
      case 'NotifyMonitoringReport':
      case 'NotifyEVChargingNeeds':
        return accion === 'NotifyEVChargingNeeds' ? { status: 'Accepted' } : {};

      default:
        throw new ErrorOcpp('NotImplemented', `La acción ${accion} no está implementada en el sistema central`);
    }
  }

  private fijarConector(conexion: Conexion, id: number, status: string, errorCode: string, info: string | null, fecha: string) {
    conexion.conectores.set(id, { status, errorCode, info, fecha });
    if (id <= 1) this.cargadores.actualizarEstadoDesdeOcpp(conexion.numero_serie, ESTADO_POR_STATUS[status] ?? 'activo');
  }

  // Tarjeta RFID autorizada en Configuración, idTag de una sesión iniciada desde la app, o idTag
  // que el propio servidor envió con RemoteStartTransaction desde la consola OCPP.
  private autorizar(serie: string, idTag: string) {
    const tarjetas = this.configuracion.obtener().tarjetas_rfid_autorizadas;
    return (
      tarjetas.includes(idTag.toUpperCase()) ||
      this.esIdTagRemoto(serie, idTag) ||
      Boolean(this.manejador?.autorizarIdTag(serie, idTag))
    );
  }

  private esIdTagRemoto(serie: string, idTag: string) {
    const remoto = this.idTagsRemotos.get(serie);
    if (!remoto) return false;
    if (remoto.vence < Date.now()) {
      this.idTagsRemotos.delete(serie);
      return false;
    }
    return remoto.idTag === idTag;
  }

  // Energy.Active.Import.Register (Wh o kWh), Power.Active.Import (W o kW) y SoC (%) del último
  // sampledValue. 1.6 manda la unidad en "unit" y el valor como texto; 2.0.1, en
  // "unitOfMeasure": { unit, multiplier } y el valor como número.
  private leerMedicion(meterValue: unknown) {
    let energiaWh: number | null = null;
    let potenciaKw: number | null = null;
    let socPct: number | null = null;
    if (!Array.isArray(meterValue)) return { energiaWh, potenciaKw, socPct };
    for (const mv of meterValue) {
      for (const sv of (mv?.sampledValue ?? []) as Array<Record<string, unknown>>) {
        const medida = (sv.measurand as string) ?? 'Energy.Active.Import.Register';
        const uom = sv.unitOfMeasure as { unit?: string; multiplier?: number } | undefined;
        const unidad = (sv.unit as string) ?? uom?.unit ?? (medida.startsWith('Power') ? 'W' : 'Wh');
        const valor = Number(sv.value) * 10 ** (Number(uom?.multiplier) || 0);
        if (!Number.isFinite(valor)) continue;
        if (medida === 'Energy.Active.Import.Register') energiaWh = unidad === 'kWh' ? valor * 1000 : valor;
        if (medida === 'Power.Active.Import') potenciaKw = unidad === 'kW' ? valor : valor / 1000;
        if (medida === 'SoC') socPct = Math.min(Math.max(valor, 0), 100);
      }
    }
    return { energiaWh, potenciaKw, socPct };
  }

  private siguienteTransactionId() {
    this.ultimoTransactionId += 1;
    this.almacen.guardar('ocpp-transacciones', { ultimo: this.ultimoTransactionId });
    return this.ultimoTransactionId;
  }

  private enviar(conexion: Conexion, mensaje: unknown[], accion: string) {
    const tipo = mensaje[0] === 2 ? 'CALL' : mensaje[0] === 3 ? 'CALLRESULT' : 'CALLERROR';
    const payload =
      tipo === 'CALL' ? mensaje[3] : tipo === 'CALLRESULT' ? mensaje[2] : { codigo: mensaje[2], descripcion: mensaje[3] };
    this.anotar(conexion.numero_serie, 'salida', tipo, accion, mensaje[1] as string, payload);
    conexion.ws.send(JSON.stringify(mensaje));
  }

  private anotar(
    numero_serie: string,
    direccion: Direccion,
    tipo: MensajeOcpp['tipo'],
    accion: string | null,
    mensaje_id: string | null,
    payload: unknown,
  ) {
    this.registro.push({
      id: ++this.secuenciaRegistro,
      fecha: new Date().toISOString(),
      numero_serie,
      direccion,
      tipo,
      accion,
      mensaje_id,
      payload,
    });
    if (this.registro.length > MAX_MENSAJES_REGISTRO) this.registro.splice(0, this.registro.length - MAX_MENSAJES_REGISTRO);
  }
}
