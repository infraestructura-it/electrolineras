import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { SesionesService } from './sesiones.service';

@Controller('sesiones')
export class SesionesController {
  constructor(private readonly sesionesService: SesionesService) {}

  @Get()
  listar() {
    return this.sesionesService.listar();
  }

  @Get(':id')
  obtener(@Param('id') id: string) {
    return this.sesionesService.obtener(id);
  }

  // Se identifica el cargador por numero_serie (desde el QR) o por cargador_id.
  @Post()
  iniciar(@Body() body: { cargador_id?: string; numero_serie?: string; usuario_id: string }) {
    return this.sesionesService.iniciar(body);
  }

  @Post(':id/finalizar')
  finalizar(@Param('id') id: string, @Body() body: { kwh_consumidos?: number }) {
    return this.sesionesService.finalizar(id, body?.kwh_consumidos);
  }

  @Post(':id/pagar')
  pagar(@Param('id') id: string) {
    return this.sesionesService.pagar(id);
  }
}
