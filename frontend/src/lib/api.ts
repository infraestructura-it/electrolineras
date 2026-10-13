// Cliente central de API — todas las llamadas al backend de Electrolineras pasan por aquí.
// Cada función corresponde a un endpoint real de backend/src/modules/*.

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
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
    throw new Error(mensaje || `Error ${res.status} en ${path}`);
  }
  return res.json();
}

// ---------- Tipos ----------

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
  referencia_pasarela: string | null;
  fecha: string;
}

export interface SesionCarga {
  id: string;
  cargador_id: string;
  numero_serie: string;
  usuario_id: string;
  estado: 'en_curso' | 'finalizada' | 'fallida';
  inicio: string;
  fin: string | null;
  kwh_consumidos: number;
  tarifa_por_kwh: number;
  costo_total: number | null;
  costo_estimado: number;
  medicion_simulada: boolean;
  pago: PagoSesion | null;
}

export interface RepartoFacturacion {
  estado_pago: 'pendiente' | 'aprobado' | 'rechazado';
  monto_total: number;
  comision_plataforma: number;
  monto_operador: number;
  referencia_pasarela: string | null;
}

// ---------- Operadores ----------
// backend/src/modules/operadores

export const operadoresApi = {
  listar: () => request<Operador[]>('/operadores'),
  obtener: (id: string) => request<Operador>(`/operadores/${id}`),
  crear: (data: {
    nombre: string;
    email_contacto?: string;
    cuenta_beneficiario?: string;
    comision_pactada?: number | null;
  }) => request<Operador>('/operadores', { method: 'POST', body: JSON.stringify(data) }),
};

// ---------- Cargadores ----------
// backend/src/modules/cargadores

export const cargadoresApi = {
  listar: () => request<Cargador[]>('/cargadores'),
  obtenerPorSerie: (numero_serie: string) =>
    request<Cargador>(`/cargadores/${encodeURIComponent(numero_serie)}`),
  registrar: (data: {
    numero_serie: string;
    modelo: string;
    operador_id: string;
    ubicacion?: string;
    tarifa_por_kwh?: number | null;
  }) => request<Cargador>('/cargadores', { method: 'POST', body: JSON.stringify(data) }),
  actualizar: (
    numero_serie: string,
    data: { ubicacion?: string; tarifa_por_kwh?: number | null; estado?: EstadoCargador },
  ) =>
    request<Cargador>(`/cargadores/${encodeURIComponent(numero_serie)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
};

// ---------- Sesiones de carga ----------
// backend/src/modules/sesiones

export const sesionesApi = {
  listar: () => request<SesionCarga[]>('/sesiones'),
  obtener: (id: string) => request<SesionCarga>(`/sesiones/${id}`),
  iniciar: (data: { numero_serie?: string; cargador_id?: string; usuario_id: string }) =>
    request<SesionCarga>('/sesiones', { method: 'POST', body: JSON.stringify(data) }),
  // kwh_consumidos es opcional: sin él, el backend usa la última medición.
  finalizar: (id: string, kwh_consumidos?: number) =>
    request<SesionCarga>(`/sesiones/${id}/finalizar`, {
      method: 'POST',
      body: JSON.stringify(kwh_consumidos === undefined ? {} : { kwh_consumidos }),
    }),
  pagar: (id: string) => request<SesionCarga>(`/sesiones/${id}/pagar`, { method: 'POST' }),
};

// ---------- Facturación ----------
// backend/src/modules/facturacion

export const facturacionApi = {
  cobrar: (data: {
    monto_total: number;
    comision_pactada: number | null; // porcentaje: 20 = 20 %
    cuenta_beneficiario: string;
  }) =>
    request<RepartoFacturacion>('/facturacion/cobrar', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// ---------- Utilidades de formato ----------

export const formatoCOP = (valor: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(valor);

export const formatoKwh = (valor: number) =>
  `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(valor)} kWh`;
