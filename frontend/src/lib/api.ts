// Cliente central de API — todas las llamadas al backend de Electrolineras pasan por aquí.
// Cada función corresponde a un endpoint real de backend/src/modules/*.

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const texto = await res.text();
    throw new Error(`Error ${res.status} en ${path}: ${texto}`);
  }
  return res.json();
}

// ---------- Tipos ----------

export interface Operador {
  id: string;
  nombre: string;
  email_contacto?: string;
  comision_pactada?: number | null;
}

export interface Cargador {
  id: string;
  numero_serie: string;
  modelo: string;
  ubicacion?: string;
  estado: 'activo' | 'inactivo' | 'en_falla';
  operador_id?: string;
}

export interface SesionCarga {
  id: string;
  cargador_id: string;
  usuario_id: string;
  estado: 'en_curso' | 'finalizada' | 'fallida';
  inicio: string;
  fin?: string | null;
  kwh_consumidos?: number;
}

export interface RepartoFacturacion {
  estado_pago: 'pendiente' | 'aprobado' | 'rechazado';
  comision_plataforma: number;
  monto_operador: number;
  referencia_pasarela: string | null;
}

// ---------- Operadores ----------
// backend/src/modules/operadores

export const operadoresApi = {
  listar: () => request<Operador[]>('/operadores'),
  obtener: (id: string) => request<Operador>(`/operadores/${id}`),
  crear: (data: { nombre: string; email_contacto?: string }) =>
    request<Operador>('/operadores', { method: 'POST', body: JSON.stringify(data) }),
};

// ---------- Cargadores ----------
// backend/src/modules/cargadores

export const cargadoresApi = {
  listar: () => request<Cargador[]>('/cargadores'),
  obtenerPorSerie: (numero_serie: string) =>
    request<Cargador>(`/cargadores/${numero_serie}`),
  registrar: (data: { numero_serie: string; modelo: string; operador_id: string }) =>
    request<Cargador>('/cargadores', { method: 'POST', body: JSON.stringify(data) }),
};

// ---------- Sesiones de carga ----------
// backend/src/modules/sesiones

export const sesionesApi = {
  iniciar: (data: { cargador_id: string; usuario_id: string }) =>
    request<SesionCarga>('/sesiones', { method: 'POST', body: JSON.stringify(data) }),
  finalizar: (id: string, kwh_consumidos: number) =>
    request<SesionCarga>(`/sesiones/${id}/finalizar`, {
      method: 'POST',
      body: JSON.stringify({ kwh_consumidos }),
    }),
};

// ---------- Facturación ----------
// backend/src/modules/facturacion

export const facturacionApi = {
  cobrar: (data: {
    monto_total: number;
    comision_pactada: number | null;
    cuenta_beneficiario: string;
  }) =>
    request<RepartoFacturacion>('/facturacion/cobrar', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};
