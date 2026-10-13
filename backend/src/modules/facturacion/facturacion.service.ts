import { Injectable } from '@nestjs/common';
import { ConfiguracionService } from '../configuracion/configuracion.service';

@Injectable()
export class FacturacionService {
  constructor(private readonly configuracion: ConfiguracionService) {}

  calcularCosto(kwh_consumidos: number, tarifa_por_kwh: number) {
    return Number((kwh_consumidos * tarifa_por_kwh).toFixed(2));
  }

  // comision_pactada es un porcentaje (20 = 20 %). Si el operador no tiene una pactada,
  // se usa la comisión por defecto de Configuración (negociación comercial por operador).
  calcularReparto(monto_total: number, comision_pactada: number | null) {
    const porcentaje = comision_pactada ?? this.configuracion.obtener().comision_por_defecto;
    const comision_plataforma = Number(((monto_total * porcentaje) / 100).toFixed(2));
    const monto_operador = Number((monto_total - comision_plataforma).toFixed(2));
    return { comision_plataforma, monto_operador, porcentaje_comision: porcentaje };
  }

  // TODO: integrar con la API de Wompi:
  // 1. Crear transacción de cobro (monto_total) al usuario final.
  // 2. Usar la API de dispersión de pagos para transferir monto_operador
  //    a la cuenta beneficiaria del operador, reteniendo comision_plataforma.
  async cobrarYDispersar(params: {
    monto_total: number;
    comision_pactada: number | null;
    cuenta_beneficiario: string | null;
  }) {
    const reparto = this.calcularReparto(params.monto_total, params.comision_pactada);
    return {
      estado_pago: 'pendiente' as const,
      monto_total: params.monto_total,
      comision_plataforma: reparto.comision_plataforma,
      monto_operador: reparto.monto_operador,
      porcentaje_comision: reparto.porcentaje_comision,
      referencia_pasarela: null,
    };
  }
}
