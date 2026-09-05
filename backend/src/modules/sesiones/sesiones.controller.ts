import { Controller, Post, Param, Body } from '@nestjs/common';
import { SesionesService } from './sesiones.service';

@Controller('sesiones')
export class SesionesController {
  constructor(private readonly sesionesService: SesionesService) {}

  @Post()
  iniciar(@Body() body: { cargador_id: string; usuario_id: string }) {
    return this.sesionesService.iniciar(body);
  }

  @Post(':id/finalizar')
  finalizar(@Param('id') id: string, @Body() body: { kwh_consumidos: number }) {
    return this.sesionesService.finalizar(id, body.kwh_consumidos);
  }
}
