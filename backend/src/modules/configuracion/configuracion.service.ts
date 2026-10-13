import { BadRequestException, Injectable } from '@nestjs/common';
import { AlmacenService } from '../../comun/almacen.service';

export interface Configuracion {
  comision_por_defecto: number; // % si el operador no tiene comisión pactada
  url_publica_app: string; // base de la URL del QR; vacío = la URL del panel
  permitir_registro_operadores: boolean;
  aceptar_cargadores_desconocidos: boolean; // BootNotification de un pile no registrado
  intervalo_heartbeat_s: number;
  tarjetas_rfid_autorizadas: string[];
  simular_medicion: boolean; // kWh simulados para cargadores sin conexión OCPP
  potencia_simulada_kw: number;
}

const POR_DEFECTO: Configuracion = {
  comision_por_defecto: 20,
  url_publica_app: '',
  permitir_registro_operadores: true,
  aceptar_cargadores_desconocidos: false,
  intervalo_heartbeat_s: 300,
  tarjetas_rfid_autorizadas: [],
  simular_medicion: process.env.SIMULAR_MEDICION !== 'false',
  potencia_simulada_kw: Number(process.env.POTENCIA_SIMULADA_KW) || 30,
};

@Injectable()
export class ConfiguracionService {
  private config: Configuracion;

  constructor(private readonly almacen: AlmacenService) {
    this.config = { ...POR_DEFECTO, ...this.almacen.leer<Partial<Configuracion>>('configuracion', {}) };
  }

  obtener(): Configuracion {
    return { ...this.config, tarjetas_rfid_autorizadas: [...this.config.tarjetas_rfid_autorizadas] };
  }

  // Lo que la app de usuario y las pantallas de login necesitan sin autenticarse.
  publica() {
    return {
      url_publica_app: this.config.url_publica_app,
      permitir_registro_operadores: this.config.permitir_registro_operadores,
    };
  }

  actualizar(cambios: Partial<Configuracion>): Configuracion {
    const nueva = { ...this.config };
    const numero = (valor: unknown, campo: string, min: number, max: number) => {
      const n = Number(valor);
      if (!Number.isFinite(n) || n < min || n > max) {
        throw new BadRequestException(`${campo} debe estar entre ${min} y ${max}`);
      }
      return n;
    };

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
    for (const campo of [
      'permitir_registro_operadores',
      'aceptar_cargadores_desconocidos',
      'simular_medicion',
    ] as const) {
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

    this.config = nueva;
    this.almacen.guardar('configuracion', this.config);
    return this.obtener();
  }
}
