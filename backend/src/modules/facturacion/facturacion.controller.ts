import { Controller, Post, Body } from '@nestjs/common';
import { FacturacionService } from './facturacion.service';

@Controller('facturacion')
export class FacturacionController {
  constructor(private readonly facturacionService: FacturacionService) {}

  @Post('cobrar')
  cobrar(
    @Body()
    body: {
      monto_total: number;
      comision_pactada: number | null;
      cuenta_beneficiario: string;
    },
  ) {
    return this.facturacionService.cobrarYDispersar(body);
  }
}
