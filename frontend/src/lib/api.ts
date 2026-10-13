// Cliente central de API — todas las llamadas al backend de Electrolineras pasan por aquí.
// Cada función corresponde a un endpoint real de backend/src/modules/*.

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const CLAVE_TOKEN = 'electrolineras:token';

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

export class ErrorApi extends Error {
  constructor(
    mensaje: string,
    readonly estado: number,
  ) {
    super(mensaje);
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = typeof window !== 'undefined' ? leerToken() : null;
  const res = await fetch(`${API_URL}${path}`, {
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
      window.dispatchEvent(new Event('electrolineras:sesion-expirada'));
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

export type Rol = 'admin' | 'operador';

export interface Usuario {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
  operador_id: string | null;
  activo?: boolean;
  creado?: string;
}

export interface Operador {
  id: string;
  nombre: string;
  email_contacto: string | null;
  cuenta_beneficiario: string | null;
  comision_pactada: number | null; // porcentaje: 20 = 20 %
}

export type EstadoCargador = 'activo' | 'inactivo' | 'en_falla';

export interface Cargador {
  id: string;
  numero_serie: string;
  modelo: string;
  ubicacion: string | null;
  estado: EstadoCargador;
  tarifa_por_kwh: number | null; // COP por kWh
  operador_id: string;
  operador_nombre?: string; // solo en GET /cargadores/:numero_serie
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
  origen: 'app' | 'rfid';
  medicion: 'ocpp' | 'simulada';
  estado: EstadoSesion;
  transaction_id: number | null;
  potencia_kw: number | null;
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

export interface Configuracion {
  comision_por_defecto: number;
  url_publica_app: string;
  permitir_registro_operadores: boolean;
  aceptar_cargadores_desconocidos: boolean;
  intervalo_heartbeat_s: number;
  tarjetas_rfid_autorizadas: string[];
  simular_medicion: boolean;
  potencia_simulada_kw: number;
}

export interface ConexionOcpp {
  numero_serie: string;
  ip: string | null;
  protocolo: string;
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

export const usuariosApi = {
  listar: () => request<Usuario[]>('/usuarios'),
  crear: (data: { email: string; nombre: string; password: string; rol: Rol; operador_id?: string }) =>
    request<Usuario>('/usuarios', enviar('POST', data)),
  cambiarActivo: (id: string, activo: boolean) => request<Usuario>(`/usuarios/${id}/activo`, enviar('PATCH', { activo })),
  cambiarClave: (id: string, password: string) => request<Usuario>(`/usuarios/${id}/clave`, enviar('PATCH', { password })),
};

export const configuracionApi = {
  publica: () => request<{ url_publica_app: string; permitir_registro_operadores: boolean }>('/configuracion/publica'),
  obtener: () => request<Configuracion>('/configuracion'),
  actualizar: (cambios: Partial<Configuracion>) => request<Configuracion>('/configuracion', enviar('PATCH', cambios)),
};

// ---------- Operadores ----------
// backend/src/modules/operadores

export const operadoresApi = {
  listar: () => request<Operador[]>('/operadores'),
  obtener: (id: string) => request<Operador>(`/operadores/${id}`),
  crear: (data: { nombre: string; email_contacto?: string; cuenta_beneficiario?: string; comision_pactada?: number | null }) =>
    request<Operador>('/operadores', enviar('POST', data)),
  actualizar: (
    id: string,
    data: { nombre?: string; email_contacto?: string; cuenta_beneficiario?: string; comision_pactada?: number | null },
  ) => request<Operador>(`/operadores/${id}`, enviar('PATCH', data)),
};

// ---------- Cargadores ----------
// backend/src/modules/cargadores

export const cargadoresApi = {
  listar: () => request<Cargador[]>('/cargadores'),
  obtenerPorSerie: (numero_serie: string) => request<Cargador>(`/cargadores/${encodeURIComponent(numero_serie)}`),
  registrar: (data: { numero_serie: string; modelo: string; operador_id: string; ubicacion?: string; tarifa_por_kwh?: number | null }) =>
    request<Cargador>('/cargadores', enviar('POST', data)),
  actualizar: (numero_serie: string, data: { ubicacion?: string; tarifa_por_kwh?: number | null; estado?: EstadoCargador }) =>
    request<Cargador>(`/cargadores/${encodeURIComponent(numero_serie)}`, enviar('PATCH', data)),
  eliminar: (numero_serie: string) => request<void>(`/cargadores/${encodeURIComponent(numero_serie)}`, enviar('DELETE')),
};

// ---------- Sesiones de carga ----------
// backend/src/modules/sesiones

export const sesionesApi = {
  listar: () => request<SesionCarga[]>('/sesiones'),
  obtener: (id: string) => request<SesionCarga>(`/sesiones/${id}`),
  iniciar: (data: { numero_serie?: string; cargador_id?: string; usuario_id: string }) =>
    request<SesionCarga>('/sesiones', enviar('POST', data)),
  // kwh_consumidos es opcional: sin él, el backend usa la última medición (o pide RemoteStop por OCPP).
  finalizar: (id: string, kwh_consumidos?: number) =>
    request<SesionCarga>(`/sesiones/${id}/finalizar`, enviar('POST', kwh_consumidos === undefined ? {} : { kwh_consumidos })),
  pagar: (id: string) => request<SesionCarga>(`/sesiones/${id}/pagar`, enviar('POST')),
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
  catalogo: () => request<ComandoOcpp[]>('/ocpp/catalogo'),
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
export const urlOcpp = () => `${API_URL.replace(/^http/, 'ws')}/ocpp`;

// ---------- Utilidades de formato ----------

export const formatoCOP = (valor: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(valor);

export const formatoKwh = (valor: number) =>
  `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(valor)} kWh`;

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
