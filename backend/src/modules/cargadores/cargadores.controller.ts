import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { CargadoresService } from './cargadores.service';

@Controller('cargadores')
export class CargadoresController {
  constructor(private readonly cargadoresService: CargadoresService) {}

  @Get()
  findAll() {
    return this.cargadoresService.findAll();
  }

  @Get(':numero_serie')
  findByNumeroSerie(@Param('numero_serie') numero_serie: string) {
    return this.cargadoresService.findByNumeroSerie(numero_serie);
  }

  @Post()
  registrar(@Body() body: { numero_serie: string; modelo: string; operador_id: string }) {
    return this.cargadoresService.registrar(body);
  }
}
