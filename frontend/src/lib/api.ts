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
    data: { nombre?: string; nit?: string; email_contacto?: string; cuenta_beneficiario?: string; comision_pactada?: number | null },
  ) => request<Operador>(`/operadores/${id}`, enviar('PATCH', data)),
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
export const urlOcpp = () => `${API_URL.replace(/^http/, 'ws')}/ocpp`;

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
