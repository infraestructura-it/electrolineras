import { Controller, Post, Body } from '@nestjs/common';
import { FacturacionService } from './facturacion.service';

@Controller('facturacion')
export class FacturacionController {
  constructor(private readonly facturacionService: FacturacionService) {}

  // Simulador de cobro del panel. El cobro real de una sesión va por POST /sesiones/:id/pagar.
  @Post('cobrar')
  cobrar(
    @Body()
    body: {
      monto_total: number;
      comision_pactada: number | null; // porcentaje: 20 = 20 %
      cuenta_beneficiario: string;
    },
  ) {
    return this.facturacionService.cobrarYDispersar(body);
  }
}
