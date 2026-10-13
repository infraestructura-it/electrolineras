import { BadRequestException, Injectable } from '@nestjs/common';
import { AlmacenService } from '../../comun/almacen.service';

// Parametrización de las proformas (prefacturas). Los datos del emisor y los textos legales
// se copian en cada proforma al generarla, así que cambiarlos no altera las ya emitidas.
export interface ParametrosFacturacion {
  razon_social: string;
  nit: string;
  direccion: string;
  ciudad: string;
  telefono: string;
  correo: string;
  sitio_web: string;
  texto_legal: string; // régimen, responsabilidades, resolución (bloque a la derecha del cliente)
  prefijo: string;
  siguiente_consecutivo: number;
  iva_porcentaje: number; // la tarifa por kWh ya incluye el IVA (precio al consumidor final)
  retefuente_porcentaje: number; // sobre el subtotal
  reteiva_porcentaje: number; // sobre el IVA
  reteica_por_mil: number; // sobre el subtotal, en ‰ (Bogotá: 11.04 x 1000)
  dias_vencimiento: number;
  forma_pago: string;
  codigo_producto: string;
  descripcion_producto: string;
  nota_pie: string;
}

export interface Configuracion {
  comision_por_defecto: number; // % si el operador no tiene comisión pactada
  url_publica_app: string; // base de la URL del QR; vacío = la URL del panel
  permitir_registro_operadores: boolean;
  aceptar_cargadores_desconocidos: boolean; // BootNotification de un pile no registrado
  intervalo_heartbeat_s: number;
  tarjetas_rfid_autorizadas: string[];
  simular_medicion: boolean; // kWh simulados para cargadores sin conexión OCPP
  potencia_simulada_kw: number;
  facturacion: ParametrosFacturacion;
}

const FACTURACION_POR_DEFECTO: ParametrosFacturacion = {
  razon_social: 'INFRAESTRUCTURA-IT',
  nit: '',
  direccion: '',
  ciudad: 'Bogotá, D.C.',
  telefono: '',
  correo: '',
  sitio_web: 'www.infraestructura-it.com',
  texto_legal: '',
  prefijo: 'PF',
  siguiente_consecutivo: 1,
  iva_porcentaje: 19,
  retefuente_porcentaje: 0,
  reteiva_porcentaje: 0,
  reteica_por_mil: 0,
  dias_vencimiento: 0,
  forma_pago: 'CONTADO',
  codigo_producto: 'CARGA-DC',
  descripcion_producto: 'Servicio de carga de vehículo eléctrico DC',
  nota_pie: 'Este documento es una proforma (prefactura) y no reemplaza la factura electrónica de venta.',
};

const POR_DEFECTO: Configuracion = {
  comision_por_defecto: 20,
  url_publica_app: '',
  permitir_registro_operadores: true,
  aceptar_cargadores_desconocidos: false,
  intervalo_heartbeat_s: 300,
  tarjetas_rfid_autorizadas: [],
  simular_medicion: process.env.SIMULAR_MEDICION !== 'false',
  potencia_simulada_kw: Number(process.env.POTENCIA_SIMULADA_KW) || 30,
  facturacion: FACTURACION_POR_DEFECTO,
};

const TEXTOS_FACTURACION: { campo: keyof ParametrosFacturacion; max: number; nombre: string }[] = [
  { campo: 'razon_social', max: 120, nombre: 'La razón social' },
  { campo: 'nit', max: 30, nombre: 'El NIT' },
  { campo: 'direccion', max: 120, nombre: 'La dirección' },
  { campo: 'ciudad', max: 60, nombre: 'La ciudad' },
  { campo: 'telefono', max: 40, nombre: 'El teléfono' },
  { campo: 'correo', max: 120, nombre: 'El correo' },
  { campo: 'sitio_web', max: 120, nombre: 'El sitio web' },
  { campo: 'texto_legal', max: 1200, nombre: 'El texto legal' },
  { campo: 'forma_pago', max: 40, nombre: 'La forma de pago' },
  { campo: 'codigo_producto', max: 30, nombre: 'El código de producto' },
  { campo: 'descripcion_producto', max: 160, nombre: 'La descripción del producto' },
  { campo: 'nota_pie', max: 400, nombre: 'La nota al pie' },
];

const numero = (valor: unknown, campo: string, min: number, max: number) => {
  const n = Number(valor);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new BadRequestException(`${campo} debe estar entre ${min} y ${max}`);
  }
  return n;
};

@Injectable()
export class ConfiguracionService {
  private config: Configuracion;
  // Lo registra ProformasService: primer consecutivo libre para un prefijo dado.
  private primerConsecutivoLibre: (prefijo: string) => number = () => 1;

  constructor(private readonly almacen: AlmacenService) {
    const guardada = this.almacen.leer<Partial<Configuracion>>('configuracion', {});
    this.config = {
      ...POR_DEFECTO,
      ...guardada,
      facturacion: { ...FACTURACION_POR_DEFECTO, ...(guardada.facturacion ?? {}) },
    };
  }

  obtener(): Configuracion {
    return {
      ...this.config,
      tarjetas_rfid_autorizadas: [...this.config.tarjetas_rfid_autorizadas],
      facturacion: { ...this.config.facturacion },
    };
  }

  // Lo que la app de usuario y las pantallas de login necesitan sin autenticarse.
  publica() {
    return {
      url_publica_app: this.config.url_publica_app,
      permitir_registro_operadores: this.config.permitir_registro_operadores,
    };
  }

  registrarConsecutivoLibre(fn: (prefijo: string) => number) {
    this.primerConsecutivoLibre = fn;
  }

  // Reserva el siguiente número de proforma. Se guarda antes de devolverlo, así un corte
  // a mitad de la generación salta un número pero nunca lo repite.
  reservarConsecutivo(): { prefijo: string; numero: number } {
    const f = this.config.facturacion;
    // Nunca reutilizar un número ya emitido con este prefijo.
    f.siguiente_consecutivo = Math.max(f.siguiente_consecutivo, this.primerConsecutivoLibre(f.prefijo));
    const reservado = { prefijo: f.prefijo, numero: f.siguiente_consecutivo };
    f.siguiente_consecutivo += 1;
    this.almacen.guardar('configuracion', this.config);
    return reservado;
  }

  actualizar(cambios: Partial<Configuracion>): Configuracion {
    const nueva: Configuracion = { ...this.config, facturacion: { ...this.config.facturacion } };

    if (cambios.comision_por_defecto !== undefined)
      nueva.comision_por_defecto = numero(cambios.comision_por_defecto, 'La comisión por defecto', 0, 100);
    if (cambios.intervalo_heartbeat_s !== undefined)
      nueva.intervalo_heartbeat_s = numero(cambios.intervalo_heartbeat_s, 'El intervalo de heartbeat', 10, 86400);
    if (cambios.potencia_simulada_kw !== undefined)
      nueva.potencia_simulada_kw = numero(cambios.potencia_simulada_kw, 'La potencia simulada', 1, 400);
    if (cambios.url_publica_app !== undefined) {
      const url = String(cambios.url_publica_app).trim().replace(/\/+$/, '');
      if (url && !/^https?:\/\/[^\s]+$/i.test(url)) {
        throw new BadRequestException('La URL pública debe empezar por http:// o https://');
      }
      nueva.url_publica_app = url;
    }
    for (const campo of ['permitir_registro_operadores', 'aceptar_cargadores_desconocidos', 'simular_medicion'] as const) {
      if (cambios[campo] !== undefined) nueva[campo] = Boolean(cambios[campo]);
    }
    if (cambios.tarjetas_rfid_autorizadas !== undefined) {
      if (!Array.isArray(cambios.tarjetas_rfid_autorizadas)) {
        throw new BadRequestException('Las tarjetas RFID deben ser una lista');
      }
      const tarjetas = cambios.tarjetas_rfid_autorizadas.map((t) => String(t).trim().toUpperCase()).filter(Boolean);
      const invalida = tarjetas.find((t) => t.length > 20);
      if (invalida) throw new BadRequestException(`La tarjeta ${invalida} supera los 20 caracteres de OCPP 1.6`);
      nueva.tarjetas_rfid_autorizadas = [...new Set(tarjetas)];
    }
    if (cambios.facturacion !== undefined) {
      nueva.facturacion = this.validarFacturacion(nueva.facturacion, cambios.facturacion);
    }

    this.config = nueva;
    this.almacen.guardar('configuracion', this.config);
    return this.obtener();
  }

  private validarFacturacion(
    actual: ParametrosFacturacion,
    cambios: Partial<ParametrosFacturacion>,
  ): ParametrosFacturacion {
    if (typeof cambios !== 'object' || cambios === null) throw new BadRequestException('Parámetros de facturación inválidos');
    const f = { ...actual };

    for (const { campo, max, nombre } of TEXTOS_FACTURACION) {
      if (cambios[campo] === undefined) continue;
      const texto = String(cambios[campo]).trim();
      if (texto.length > max) throw new BadRequestException(`${nombre} admite máximo ${max} caracteres`);
      (f[campo] as string) = texto;
    }
    if (!f.razon_social) throw new BadRequestException('La razón social es obligatoria');
    if (f.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.correo)) throw new BadRequestException('Escribe un correo válido');

    if (cambios.prefijo !== undefined) {
      const prefijo = String(cambios.prefijo).trim().toUpperCase();
      if (!/^[A-Z0-9]{1,6}$/.test(prefijo)) throw new BadRequestException('El prefijo admite de 1 a 6 letras o números');
      f.prefijo = prefijo;
    }
    if (cambios.siguiente_consecutivo !== undefined) {
      const n = numero(cambios.siguiente_consecutivo, 'El siguiente consecutivo', 1, 99_999_999);
      if (!Number.isInteger(n)) throw new BadRequestException('El consecutivo debe ser un número entero');
      f.siguiente_consecutivo = n;
    }
    // Un consecutivo por debajo de una proforma ya emitida con ese prefijo la duplicaría.
    const libre = this.primerConsecutivoLibre(f.prefijo);
    if (f.siguiente_consecutivo < libre) {
      if (cambios.siguiente_consecutivo !== undefined || cambios.prefijo !== undefined) {
        throw new BadRequestException(
          `Ya hay proformas emitidas con el prefijo ${f.prefijo} hasta el número ${libre - 1}: el siguiente consecutivo debe ser al menos ${libre}`,
        );
      }
      f.siguiente_consecutivo = libre;
    }
    if (cambios.iva_porcentaje !== undefined) f.iva_porcentaje = numero(cambios.iva_porcentaje, 'El IVA', 0, 100);
    if (cambios.retefuente_porcentaje !== undefined)
      f.retefuente_porcentaje = numero(cambios.retefuente_porcentaje, 'La retención en la fuente', 0, 100);
    if (cambios.reteiva_porcentaje !== undefined) f.reteiva_porcentaje = numero(cambios.reteiva_porcentaje, 'La ReteIVA', 0, 100);
    if (cambios.reteica_por_mil !== undefined) f.reteica_por_mil = numero(cambios.reteica_por_mil, 'La ReteICA', 0, 1000);
    if (cambios.dias_vencimiento !== undefined) {
      f.dias_vencimiento = Math.round(numero(cambios.dias_vencimiento, 'Los días de vencimiento', 0, 365));
    }
    return f;
  }
}
