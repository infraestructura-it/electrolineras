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
import { CATALOGO_COMANDOS, validarComando } from './ocpp-comandos';

// Gateway OCPP 1.6J (sistema central / CSMS) para cargadores como el MDXDC3001.
// El cargador se conecta por WebSocket a  ws(s)://<servidor>:<puerto>/ocpp/<pile_number>
// (en el equipo: domain_master = ws://<servidor>:3000/ocpp y pile_number_master = numero_serie).
//
// Mensajes OCPP-J: CALL [2, id, acción, payload] · CALLRESULT [3, id, payload] · CALLERROR [4, id, código, descripción, detalles]

const RUTA_OCPP = '/ocpp';
const TIEMPO_ESPERA_RESPUESTA_MS = 30_000;
const VIGENCIA_IDTAG_REMOTO_MS = 5 * 60_000;
const MAX_MENSAJES_REGISTRO = 1000;

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
    transactionId: number;
    connectorId: number;
    idTag: string;
    meterStartWh: number;
    fecha: string;
    // 'panel' si la carga la ordenó un admin con RemoteStartTransaction desde la consola OCPP.
    origen: 'rfid' | 'panel';
  }): void;
  alMedir(d: { numero_serie: string; transactionId: number | null; energiaWh: number | null; potenciaKw: number | null }): void;
  alDetenerTransaccion(d: { numero_serie: string; transactionId: number; meterStopWh: number; fecha: string; motivo: string | null }): void;
}

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
      handleProtocols: (protocolos) => (protocolos.has('ocpp1.6') ? 'ocpp1.6' : false),
    });

    servidor.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const ruta = new URL(req.url ?? '/', 'http://localhost').pathname.replace(/\/+$/, '');
      if (!ruta.startsWith(`${RUTA_OCPP}/`)) {
        socket.destroy();
        return;
      }
      const numero_serie = decodeURIComponent(ruta.slice(RUTA_OCPP.length + 1).split('/').pop() ?? '');
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
      this.wss!.handleUpgrade(req, socket, head, (ws) => this.alConectar(ws, req, numero_serie));
    });

    this.logger.log(`Gateway OCPP 1.6J escuchando en ${RUTA_OCPP}/<numero_serie>`);
  }

  onModuleDestroy() {
    for (const c of this.conexiones.values()) c.ws.close(1001, 'Servidor detenido');
    this.wss?.close();
  }

  // ---------- Consultas para el panel ----------

  estaConectado(numero_serie: string) {
    return this.conexiones.get(numero_serie)?.ws.readyState === WebSocket.OPEN;
  }

  listarConexiones(series: string[] | null) {
    return [...this.conexiones.values()]
      .filter((c) => !series || series.includes(c.numero_serie))
      .map((c) => ({
        numero_serie: c.numero_serie,
        ip: c.ip,
        protocolo: c.protocolo,
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

  catalogo() {
    return CATALOGO_COMANDOS.map(({ accion, descripcion, plantilla }) => ({ accion, descripcion, plantilla }));
  }

  // ---------- Comandos del sistema central hacia el cargador ----------

  async enviarComando(numero_serie: string, accion: string, payload: unknown): Promise<RespuestaComando> {
    const errores = validarComando(accion, payload ?? {});
    if (errores.length) throw new BadRequestException(`Payload inválido para ${accion}: ${errores.join('; ')}`);

    const conexion = this.conexiones.get(numero_serie);
    if (!conexion || conexion.ws.readyState !== WebSocket.OPEN) {
      throw new ConflictException(`El cargador ${numero_serie} no está conectado por OCPP`);
    }

    if (accion === 'RemoteStartTransaction') {
      const idTag = String((payload as { idTag: string }).idTag);
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
      conectado_desde: ahora,
      ultimo_mensaje: ahora,
      ultimo_heartbeat: null,
      boot: null,
      boot_aceptado: false,
      conectores: new Map(),
    };
    this.conexiones.set(numero_serie, conexion);
    this.anotar(numero_serie, 'sistema', 'EVENTO', 'Conectado', null, { ip: conexion.ip, protocolo: conexion.protocolo });

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
        const respuesta = this.atender(conexion, accion, payload);
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
        const { energiaWh, potenciaKw } = this.leerMedicion(p.meterValue);
        this.manejador?.alMedir({
          numero_serie: serie,
          transactionId: Number.isInteger(p.transactionId) ? (p.transactionId as number) : null,
          energiaWh,
          potenciaKw,
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

  // Energy.Active.Import.Register (Wh o kWh) y Power.Active.Import (W o kW) del último sampledValue.
  private leerMedicion(meterValue: unknown) {
    let energiaWh: number | null = null;
    let potenciaKw: number | null = null;
    if (!Array.isArray(meterValue)) return { energiaWh, potenciaKw };
    for (const mv of meterValue) {
      for (const sv of (mv?.sampledValue ?? []) as Array<Record<string, unknown>>) {
        const valor = Number(sv.value);
        if (!Number.isFinite(valor)) continue;
        const medida = (sv.measurand as string) ?? 'Energy.Active.Import.Register';
        const unidad = (sv.unit as string) ?? (medida.startsWith('Power') ? 'W' : 'Wh');
        if (medida === 'Energy.Active.Import.Register') energiaWh = unidad === 'kWh' ? valor * 1000 : valor;
        if (medida === 'Power.Active.Import') potenciaKw = unidad === 'kW' ? valor : valor / 1000;
      }
    }
    return { energiaWh, potenciaKw };
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
