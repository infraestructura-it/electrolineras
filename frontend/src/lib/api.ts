// Cliente central de API — todas las llamadas al backend de Electrolineras pasan por aquí.
// Cada función corresponde a un endpoint real de backend/src/modules/*.

const API_ENV = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// Dirección de la API según cómo se abrió la página:
// - por HTTPS (detrás de Caddy, p. ej. https://cargador.infraestructura-it.com): mismo dominio,
//   bajo /api. Así no hay contenido mixto (https → http) que el navegador bloquee.
// - por HTTP (http://<IP>:3001): NEXT_PUBLIC_API_URL, como siempre.
function apiUrl() {
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') return `${window.location.origin}/api`;
  return API_ENV;
}
const CLAVE_TOKEN = 'electrolineras:token';
const CLAVE_CONDUCTOR = 'electrolineras:conductor'; // token de la app del conductor (independiente del panel)

// ---------- Token de sesión del panel ----------

export function leerToken(): string | null {
  try {
    return window.localStorage.getItem(CLAVE_TOKEN);
  } catch {
    return null;
  }
}

export function guardarToken(token: string | null) {
  try {
    if (token) window.localStorage.setItem(CLAVE_TOKEN, token);
    else window.localStorage.removeItem(CLAVE_TOKEN);
  } catch {
    /* almacenamiento no disponible: la sesión dura lo que la pestaña */
  }
}

// ---------- Token de la app del conductor ----------

export function leerTokenConductor(): string | null {
  try {
    return window.localStorage.getItem(CLAVE_CONDUCTOR);
  } catch {
    return null;
  }
}

export function guardarTokenConductor(token: string | null) {
  try {
    if (token) window.localStorage.setItem(CLAVE_CONDUCTOR, token);
    else window.localStorage.removeItem(CLAVE_CONDUCTOR);
  } catch {
    /* almacenamiento no disponible */
  }
}

export class ErrorApi extends Error {
  constructor(
    mensaje: string,
    readonly estado: number,
  ) {
    super(mensaje);
  }
}

// quien: qué token se envía. 'panel' (por defecto) o 'conductor' (app del usuario final).
async function request<T>(path: string, options?: RequestInit, quien: 'panel' | 'conductor' = 'panel'): Promise<T> {
  const token = typeof window === 'undefined' ? null : quien === 'conductor' ? leerTokenConductor() : leerToken();
  const res = await fetch(`${apiUrl()}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    // NestJS responde { message, error, statusCode }: mostramos el mensaje legible.
    const texto = await res.text();
    let mensaje = texto;
    try {
      const json = JSON.parse(texto);
      mensaje = Array.isArray(json.message) ? json.message.join(', ') : json.message ?? texto;
    } catch {
      /* respuesta no JSON */
    }
    if (res.status === 401 && typeof window !== 'undefined') {
      if (quien === 'conductor') guardarTokenConductor(null);
      else window.dispatchEvent(new Event('electrolineras:sesion-expirada'));
    }
    throw new ErrorApi(mensaje || `Error ${res.status} en ${path}`, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

const enviar = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

// ---------- Tipos ----------

// admin = administrador de la plataforma; administrador = de una empresa; operario = de una empresa.
export type Rol = 'admin' | 'administrador' | 'operario';

export const NOMBRE_ROL: Record<Rol, string> = {
  admin: 'Administrador de plataforma',
  administrador: 'Administrador de empresa',
  operario: 'Operario',
};

export interface Usuario {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
  operador_id: string | null; // empresa
  zona_id: string | null; // solo operario
  activo?: boolean;
  creado?: string;
}

export interface Zona {
  id: string;
  nombre: string;
  descripcion: string | null;
  creado: string;
}

export interface Electrolinera {
  id: string;
  nombre: string;
  operador_id: string;
  zona_id: string | null;
  direccion: string | null;
  ciudad: string | null;
  latitud: number | null;
  longitud: number | null;
  horario: string | null;
  descripcion: string | null;
  creado: string;
}

export type DatosElectrolinera = Partial<Omit<Electrolinera, 'id' | 'creado'>>;

export interface Operador {
  id: string;
  nombre: string;
  nit: string | null;
  email_contacto: string | null;
  cuenta_beneficiario: string | null;
  comision_pactada: number | null; // porcentaje: 20 = 20 %
  puntos: ProgramaPuntos;
}

// Programa de puntos de la empresa: puntos por kWh, valor en pesos de cada punto y mínimo para redimir.
export interface ProgramaPuntos {
  activo: boolean;
  puntos_por_kwh: number;
  valor_punto_cop: number;
  minimo_canje: number;
}

export type EstadoCargador = 'activo' | 'inactivo' | 'en_falla';

export type VersionOcpp = 'auto' | '1.6' | '2.0.1';

export interface Cargador {
  id: string;
  numero_serie: string;
  modelo: string;
  ubicacion: string | null; // punto dentro de la electrolinera
  estado: EstadoCargador;
  tarifa_por_kwh: number | null; // COP por kWh
  operador_id: string;
  electrolinera_id: string | null;
  version_ocpp: VersionOcpp;
  potencia_kw: number;
}

// GET /cargadores/:numero_serie (público, para la app del conductor)
export interface CargadorPublico {
  id: string;
  numero_serie: string;
  modelo: string;
  ubicacion: string | null;
  estado: EstadoCargador;
  tarifa_por_kwh: number | null;
  potencia_kw: number;
  operador_id: string;
  operador_nombre: string;
  electrolinera: Pick<Electrolinera, 'id' | 'nombre' | 'direccion' | 'ciudad' | 'latitud' | 'longitud' | 'horario'> | null;
}

export type DatosCargador = {
  numero_serie?: string;
  modelo?: string;
  operador_id?: string;
  ubicacion?: string;
  tarifa_por_kwh?: number | null;
  electrolinera_id?: string | null;
  version_ocpp?: VersionOcpp;
  potencia_kw?: number;
  estado?: EstadoCargador;
};

export type Disponibilidad = 'disponible' | 'ocupado' | 'fuera_de_servicio' | 'sin_conexion';

export interface CargadorMonitor {
  numero_serie: string;
  modelo: string;
  ubicacion: string | null;
  potencia_kw: number;
  tarifa_por_kwh: number | null;
  estado_registro: EstadoCargador;
  operador_id: string;
  operador_nombre: string | null;
  electrolinera: { id: string; nombre: string; ciudad: string | null } | null;
  zona: string | null;
  version_ocpp: VersionOcpp;
  disponibilidad: Disponibilidad;
  conexion: {
    ip: string | null;
    protocolo: string;
    version: '1.6' | '2.0.1';
    conectado_desde: string;
    ultimo_mensaje: string;
    ultimo_heartbeat: string | null;
    firmware: string | null;
    conector: { status: string; errorCode: string; fecha: string } | null;
  } | null;
  sesion: {
    id: string;
    estado: EstadoSesion;
    origen: 'app' | 'rfid' | 'panel';
    usuario_id: string;
    inicio: string;
    kwh_consumidos: number;
    potencia_kw: number | null;
    costo_estimado: number;
  } | null;
}

export interface Tablero {
  generado: string;
  resumen: { total: number; disponibles: number; cargando: number; fuera_de_servicio: number; sin_conexion: number; potencia_kw: number };
  cargadores: CargadorMonitor[];
}

export interface ElectrolineraMapa {
  id: string;
  nombre: string;
  direccion: string | null;
  ciudad: string | null;
  horario: string | null;
  latitud: number;
  longitud: number;
  empresa: string | null;
  cargadores: {
    numero_serie: string;
    modelo: string;
    potencia_kw: number;
    tarifa_por_kwh: number | null;
    ubicacion: string | null;
    disponibilidad: Disponibilidad;
  }[];
}

export interface PagoSesion {
  estado_pago: 'pendiente' | 'aprobado' | 'rechazado';
  monto_total: number;
  comision_plataforma: number;
  monto_operador: number;
  porcentaje_comision: number;
  referencia_pasarela: string | null;
  fecha: string;
}

export type EstadoSesion = 'iniciando' | 'en_curso' | 'deteniendo' | 'finalizada' | 'fallida';

export interface SesionCarga {
  id: string;
  cargador_id: string;
  numero_serie: string;
  operador_id: string;
  usuario_id: string;
  origen: 'app' | 'rfid' | 'panel';
  medicion: 'ocpp' | 'simulada';
  estado: EstadoSesion;
  transaction_id: number | string | null; // 1.6: entero; 2.0.1: texto
  potencia_kw: number | null;
  soc_pct?: number | null; // % de batería, si el cargador lo informa
  inicio: string;
  fin: string | null;
  kwh_consumidos: number;
  tarifa_por_kwh: number;
  costo_total: number | null;
  costo_estimado: number;
  motivo: string | null;
  medicion_simulada: boolean;
  cargador_conectado: boolean;
  pago: PagoSesion | null;
  proforma: { id: string; numero: string; codigo_verificacion: string; estado: 'vigente' | 'anulada' } | null;
  conductor_id?: string | null;
  descuento_puntos?: { puntos: number; valor: number } | null; // COP con IVA
  puntos_ganados?: number | null;
}

export interface RepartoFacturacion {
  estado_pago: 'pendiente' | 'aprobado' | 'rechazado';
  monto_total: number;
  comision_plataforma: number;
  monto_operador: number;
  porcentaje_comision: number;
  referencia_pasarela: string | null;
}

export interface Estadisticas {
  totales: {
    sesiones: number;
    en_curso: number;
    kwh: number;
    ingresos: number;
    comision_plataforma: number;
    pagos_pendientes: number;
  };
  por_dia: { fecha: string; kwh: number; ingresos: number; sesiones: number }[];
  por_cargador: { numero_serie: string; kwh: number; ingresos: number; sesiones: number }[];
}

export interface ParametrosFacturacion {
  razon_social: string;
  nit: string;
  direccion: string;
  ciudad: string;
  telefono: string;
  correo: string;
  sitio_web: string;
  texto_legal: string;
  prefijo: string;
  siguiente_consecutivo: number;
  iva_porcentaje: number;
  retefuente_porcentaje: number;
  reteiva_porcentaje: number;
  reteica_por_mil: number;
  dias_vencimiento: number;
  forma_pago: string;
  codigo_producto: string;
  descripcion_producto: string;
  nota_pie: string;
}

export interface ClienteProforma {
  nombre: string;
  documento: string;
  direccion: string;
  ciudad: string;
  telefono: string;
  correo: string;
}

export interface Proforma {
  id: string;
  numero: string;
  prefijo: string;
  consecutivo: number;
  codigo_verificacion: string;
  estado: 'vigente' | 'anulada';
  origen: 'automatica' | 'manual';
  fecha_emision: string;
  fecha_vencimiento: string;
  sesion_id: string;
  operador_id: string;
  numero_serie: string;
  emisor: Omit<ParametrosFacturacion, 'prefijo' | 'siguiente_consecutivo'>;
  punto_carga: { operador: string; ubicacion: string | null; numero_serie: string; modelo: string };
  cliente: ClienteProforma;
  lineas: {
    codigo: string;
    descripcion: string;
    detalle: string;
    cantidad: number;
    unidad: string;
    precio_unitario: number;
    valor_total: number;
  }[];
  totales: {
    total_general: number;
    descuento: number;
    subtotal: number;
    iva_porcentaje: number;
    iva: number;
    total: number;
    retefuente: number;
    reteiva: number;
    reteica: number;
    total_neto: number;
  };
  valor_en_letras: string;
  forma_pago: string;
  vendedor: string;
  aplica_retenciones: boolean;
  anulacion: { fecha: string; motivo: string; usuario: string } | null;
}

export interface ProformaResumen {
  id: string;
  numero: string;
  estado: 'vigente' | 'anulada';
  origen: 'automatica' | 'manual';
  fecha_emision: string;
  cliente: { nombre: string; documento: string };
  numero_serie: string;
  operador: string;
  total: number;
  total_neto: number;
  sesion_id: string;
  codigo_verificacion: string;
}

export interface Configuracion {
  comision_por_defecto: number;
  url_publica_app: string;
  permitir_registro_operadores: boolean;
  aceptar_cargadores_desconocidos: boolean;
  intervalo_heartbeat_s: number;
  tarjetas_rfid_autorizadas: string[];
  simular_medicion: boolean;
  potencia_simulada_kw: number;
  facturacion: ParametrosFacturacion;
}

export interface ConexionOcpp {
  numero_serie: string;
  ip: string | null;
  protocolo: string;
  version: '1.6' | '2.0.1';
  conectado_desde: string;
  ultimo_mensaje: string;
  ultimo_heartbeat: string | null;
  boot: Record<string, string> | null;
  boot_aceptado: boolean;
  registrado: boolean;
  conectores: { connectorId: number; status: string; errorCode: string; info: string | null; fecha: string }[];
}

export interface MensajeOcpp {
  id: number;
  fecha: string;
  numero_serie: string;
  direccion: 'entrada' | 'salida' | 'sistema';
  tipo: 'CALL' | 'CALLRESULT' | 'CALLERROR' | 'EVENTO';
  accion: string | null;
  mensaje_id: string | null;
  payload: unknown;
}

export interface ComandoOcpp {
  accion: string;
  descripcion: string;
  plantilla: Record<string, unknown>;
}

export type RespuestaComando =
  | { tipo: 'CALLRESULT'; payload: Record<string, unknown> }
  | { tipo: 'CALLERROR'; codigo: string; descripcion: string; detalles: unknown };

// ---------- Autenticación y usuarios ----------

export const authApi = {
  login: (email: string, password: string) =>
    request<{ token: string; usuario: Usuario }>('/auth/login', enviar('POST', { email, password })),
  registro: (data: { empresa: string; nombre: string; email: string; password: string }) =>
    request<{ token: string; usuario: Usuario }>('/auth/registro', enviar('POST', data)),
  yo: () => request<Usuario>('/auth/yo'),
};

// Huella (passkeys / WebAuthn): las opciones y respuestas son JSON de @simplewebauthn.
export interface HuellaRegistrada {
  id: string;
  nombre: string;
  creado: string;
  ultimo_uso: string | null;
}

export const huellaApi = {
  listar: () => request<HuellaRegistrada[]>('/auth/huella'),
  opcionesRegistro: () => request<Record<string, unknown>>('/auth/huella/registro/opciones', enviar('POST')),
  registrar: (respuesta: unknown, nombre: string) => request<HuellaRegistrada>('/auth/huella/registro', enviar('POST', { respuesta, nombre })),
  eliminar: (id: string) => request<void>(`/auth/huella/${encodeURIComponent(id)}`, enviar('DELETE')),
  opcionesLogin: () => request<Record<string, unknown>>('/auth/huella/login/opciones', enviar('POST')),
  login: (respuesta: unknown) => request<{ token: string; usuario: Usuario }>('/auth/huella/login', enviar('POST', { respuesta })),
};

export const usuariosApi = {
  listar: () => request<Usuario[]>('/usuarios'),
  crear: (data: { email: string; nombre: string; password: string; rol: Rol; operador_id?: string; zona_id?: string | null }) =>
    request<Usuario>('/usuarios', enviar('POST', data)),
  actualizar: (id: string, data: { nombre?: string; rol?: Rol; zona_id?: string | null }) =>
    request<Usuario>(`/usuarios/${id}`, enviar('PATCH', data)),
  cambiarActivo: (id: string, activo: boolean) => request<Usuario>(`/usuarios/${id}/activo`, enviar('PATCH', { activo })),
  cambiarClave: (id: string, password: string) => request<Usuario>(`/usuarios/${id}/clave`, enviar('PATCH', { password })),
};

export const configuracionApi = {
  publica: () => request<{ url_publica_app: string; permitir_registro_operadores: boolean }>('/configuracion/publica'),
  obtener: () => request<Configuracion>('/configuracion'),
  actualizar: (cambios: Partial<Omit<Configuracion, 'facturacion'>> & { facturacion?: Partial<ParametrosFacturacion> }) =>
    request<Configuracion>('/configuracion', enviar('PATCH', cambios)),
};

// ---------- Proformas (prefacturas) ----------
// backend/src/modules/proformas

export const proformasApi = {
  listar: (filtro: { estado?: string; q?: string } = {}) => {
    const q = new URLSearchParams();
    if (filtro.estado) q.set('estado', filtro.estado);
    if (filtro.q) q.set('q', filtro.q);
    return request<ProformaResumen[]>(`/proformas?${q}`);
  },
  obtener: (id: string) => request<Proforma>(`/proformas/${id}`),
  verificar: (codigo: string) => request<Proforma>(`/proformas/verificar/${encodeURIComponent(codigo)}`),
  generar: (data: { sesion_id: string; cliente?: ClienteProforma; aplicar_retenciones?: boolean }) =>
    request<Proforma>('/proformas', enviar('POST', data)),
  anular: (id: string, motivo: string) => request<Proforma>(`/proformas/${id}/anular`, enviar('POST', { motivo })),
};

// URL que va en el QR de una proforma: abre el documento sin login.
export const urlVerificacionProforma = (base: string, codigo: string) => `${base.replace(/\/+$/, '')}/p/${codigo}`;

// ---------- Operadores ----------
// backend/src/modules/operadores

export const operadoresApi = {
  listar: () => request<Operador[]>('/operadores'),
  obtener: (id: string) => request<Operador>(`/operadores/${id}`),
  crear: (data: { nombre: string; nit?: string; email_contacto?: string; cuenta_beneficiario?: string; comision_pactada?: number | null }) =>
    request<Operador>('/operadores', enviar('POST', data)),
  actualizar: (
    id: string,
    data: {
      nombre?: string;
      nit?: string;
      email_contacto?: string;
      cuenta_beneficiario?: string;
      comision_pactada?: number | null;
      puntos?: Partial<ProgramaPuntos>;
    },
  ) => request<Operador>(`/operadores/${id}`, enviar('PATCH', data)),
};

// ---------- Licencias ----------
// backend/src/modules/licencias

export type EstadoLicencia = 'sin_control' | 'sin_licencia' | 'vigente' | 'por_vencer' | 'en_gracia' | 'vencida';

export interface ResumenLicencias {
  configurado: boolean;
  dias_gracia: number;
  empresas: {
    operador_id: string;
    nombre: string;
    nit: string | null;
    estado: EstadoLicencia;
    licencia: { id: string; empresa: string; nit: string; max_cargadores: number; emitida: string; vence: string; activada: string } | null;
    dias_restantes: number | null;
    usados: number;
    max: number | null;
  }[];
}

export const licenciasApi = {
  resumen: () => request<ResumenLicencias>('/licencias'),
  activar: (licencia: string) => request<unknown>('/licencias', enviar('POST', { licencia })),
  eliminar: (id: string) => request<void>(`/licencias/${encodeURIComponent(id)}`, enviar('DELETE')),
};

// ---------- Zonas y electrolineras ----------
// backend/src/modules/zonas, backend/src/modules/electrolineras

export const zonasApi = {
  listar: () => request<Zona[]>('/zonas'),
  crear: (data: { nombre: string; descripcion?: string }) => request<Zona>('/zonas', enviar('POST', data)),
  actualizar: (id: string, data: { nombre?: string; descripcion?: string }) => request<Zona>(`/zonas/${id}`, enviar('PATCH', data)),
  eliminar: (id: string) => request<void>(`/zonas/${id}`, enviar('DELETE')),
};

export const electrolineasApi = {
  listar: () => request<Electrolinera[]>('/electrolineras'),
  crear: (data: DatosElectrolinera) => request<Electrolinera>('/electrolineras', enviar('POST', data)),
  actualizar: (id: string, data: DatosElectrolinera) => request<Electrolinera>(`/electrolineras/${id}`, enviar('PATCH', data)),
  eliminar: (id: string) => request<void>(`/electrolineras/${id}`, enviar('DELETE')),
};

// ---------- Monitor y mapa ----------
// backend/src/modules/monitor

export const monitorApi = {
  tablero: () => request<Tablero>('/monitor'),
  mapa: () => request<ElectrolineraMapa[]>('/mapa'),
};

// ---------- Cargadores ----------
// backend/src/modules/cargadores

export const cargadoresApi = {
  listar: () => request<Cargador[]>('/cargadores'),
  obtenerPorSerie: (numero_serie: string) => request<CargadorPublico>(`/cargadores/${encodeURIComponent(numero_serie)}`),
  registrar: (data: DatosCargador) => request<Cargador>('/cargadores', enviar('POST', data)),
  actualizar: (numero_serie: string, data: DatosCargador) =>
    request<Cargador>(`/cargadores/${encodeURIComponent(numero_serie)}`, enviar('PATCH', data)),
  eliminar: (numero_serie: string) => request<void>(`/cargadores/${encodeURIComponent(numero_serie)}`, enviar('DELETE')),
};

// ---------- Sesiones de carga ----------
// backend/src/modules/sesiones

export const sesionesApi = {
  listar: () => request<SesionCarga[]>('/sesiones'),
  obtener: (id: string) => request<SesionCarga>(`/sesiones/${id}`),
  // Desde la app: envía el token del conductor (si inició sesión) para acumular puntos.
  iniciar: (data: { numero_serie?: string; cargador_id?: string; usuario_id: string }) =>
    request<SesionCarga>('/sesiones', enviar('POST', data), 'conductor'),
  // kwh_consumidos es opcional: sin él, el backend usa la última medición (o pide RemoteStop por OCPP).
  finalizar: (id: string, kwh_consumidos?: number) =>
    request<SesionCarga>(`/sesiones/${id}/finalizar`, enviar('POST', kwh_consumidos === undefined ? {} : { kwh_consumidos })),
  pagar: (id: string, usar_puntos = false) =>
    request<SesionCarga>(`/sesiones/${id}/pagar`, enviar('POST', { usar_puntos }), 'conductor'),
};

// ---------- App del conductor: cuenta, cargas y puntos ----------
// backend/src/modules/conductores

export interface Conductor {
  id: string;
  nombre: string;
  email: string;
  celular: string | null;
  creado: string;
}

export interface MovimientoPuntos {
  id: string;
  operador_id: string;
  operador_nombre: string;
  tipo: 'acumulacion' | 'redencion' | 'reverso';
  puntos: number; // con signo
  valor_cop: number;
  sesion_id: string | null;
  fecha: string;
  detalle: string;
}

export interface ResumenPuntos {
  saldo_total: number;
  valor_total_cop: number;
  puntos_ganados: number;
  ahorro_cop: number;
  empresas: { operador_id: string; operador_nombre: string; saldo: number; valor_cop: number; minimo_canje: number; programa_activo: boolean }[];
  movimientos: MovimientoPuntos[];
}

export interface ProgramaCargador extends ProgramaPuntos {
  saldo: number;
  saldo_cop: number;
  puede_redimir: boolean;
}

const entrarConductor = (r: { token: string; conductor: Conductor }) => {
  guardarTokenConductor(r.token);
  return r.conductor;
};

export const conductorApi = {
  hayCuenta: () => typeof window !== 'undefined' && !!leerTokenConductor(),
  registro: (data: { nombre: string; email: string; celular?: string; password: string }) =>
    request<{ token: string; conductor: Conductor }>('/conductor/registro', enviar('POST', data), 'conductor').then(entrarConductor),
  login: (email: string, password: string) =>
    request<{ token: string; conductor: Conductor }>('/conductor/login', enviar('POST', { email, password }), 'conductor').then(entrarConductor),
  salir: () => guardarTokenConductor(null),
  yo: () => request<Conductor & { saldo_puntos: number; valor_puntos_cop: number }>('/conductor/yo', undefined, 'conductor'),
  cargas: () => request<SesionCarga[]>('/conductor/cargas', undefined, 'conductor'),
  puntos: () => request<ResumenPuntos>('/conductor/puntos', undefined, 'conductor'),
  programa: (numero_serie: string) =>
    request<ProgramaCargador>(`/conductor/programa/${encodeURIComponent(numero_serie)}`, undefined, 'conductor'),
};

export const estadisticasApi = {
  obtener: (dias = 14) => request<Estadisticas>(`/estadisticas?dias=${dias}`),
};

// ---------- Facturación ----------
// backend/src/modules/facturacion

export const facturacionApi = {
  cobrar: (data: { monto_total: number; comision_pactada: number | null; cuenta_beneficiario: string }) =>
    request<RepartoFacturacion>('/facturacion/cobrar', enviar('POST', data)),
};

// ---------- OCPP ----------
// backend/src/modules/ocpp-gateway

export const ocppApi = {
  conexiones: () => request<ConexionOcpp[]>('/ocpp/conexiones'),
  catalogo: (version: '1.6' | '2.0.1' = '1.6') => request<ComandoOcpp[]>(`/ocpp/catalogo?version=${version}`),
  mensajes: (filtro: { numero_serie?: string; despues_de?: number; limite?: number } = {}) => {
    const q = new URLSearchParams();
    if (filtro.numero_serie) q.set('numero_serie', filtro.numero_serie);
    if (filtro.despues_de) q.set('despues_de', String(filtro.despues_de));
    if (filtro.limite) q.set('limite', String(filtro.limite));
    return request<MensajeOcpp[]>(`/ocpp/mensajes?${q}`);
  },
  enviar: (numero_serie: string, accion: string, payload: unknown) =>
    request<RespuestaComando>(`/ocpp/${encodeURIComponent(numero_serie)}/comandos`, enviar('POST', { accion, payload })),
};

// URL del gateway OCPP que se configura en el cargador (domain_master).
// URL que se configura en el cargador (domain_master). Detrás de Caddy: wss://<dominio>/ocpp.
export const urlOcpp = () =>
  typeof window !== 'undefined' && window.location.protocol === 'https:'
    ? `wss://${window.location.host}/ocpp`
    : `${API_ENV.replace(/^http/, 'ws')}/ocpp`;

// ---------- Utilidades de formato ----------

export const formatoCOP = (valor: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(valor);

export const formatoKwh = (valor: number) =>
  `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(valor)} kWh`;

// Valores de la proforma: pesos con dos decimales, como en la factura de referencia.
export const formatoPesos = (valor: number) =>
  new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valor);

export const formatoFecha = (iso: string) =>
  new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });

export const haceCuanto = (iso: string | null) => {
  if (!iso) return 'nunca';
  const seg = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (seg < 60) return `hace ${Math.max(seg, 0)} s`;
  if (seg < 3600) return `hace ${Math.round(seg / 60)} min`;
  if (seg < 86400) return `hace ${Math.round(seg / 3600)} h`;
  return `hace ${Math.round(seg / 86400)} d`;
};
