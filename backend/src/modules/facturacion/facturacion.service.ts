import { Injectable } from '@nestjs/common';

// Comisión de respaldo, en porcentaje, si el operador aún no tiene una pactada.
// Ver docs/especificacion-tecnica.md: la comisión definitiva queda sujeta a
// negociación comercial por operador.
const COMISION_POR_DEFECTO = 20; // %

@Injectable()
export class FacturacionService {
  calcularCosto(kwh_consumidos: number, tarifa_por_kwh: number) {
    return Number((kwh_consumidos * tarifa_por_kwh).toFixed(2));
  }

  // comision_pactada es un porcentaje (20 = 20 %), igual que en la entidad Operador
  // y en el panel. No es una fracción.
  calcularReparto(monto_total: number, comision_pactada: number | null) {
    const porcentaje = comision_pactada ?? COMISION_POR_DEFECTO;
    const comision_plataforma = Number(((monto_total * porcentaje) / 100).toFixed(2));
    const monto_operador = Number((monto_total - comision_plataforma).toFixed(2));
    return { comision_plataforma, monto_operador };
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
    const { comision_plataforma, monto_operador } = this.calcularReparto(
      params.monto_total,
      params.comision_pactada,
    );
    return {
      estado_pago: 'pendiente' as const,
      monto_total: params.monto_total,
      comision_plataforma,
      monto_operador,
      referencia_pasarela: null,
    };
  }
}
