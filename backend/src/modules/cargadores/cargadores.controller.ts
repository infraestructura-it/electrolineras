import { Controller, Get, Post, Patch, Param, Body } from '@nestjs/common';
import { CargadoresService, EstadoCargador } from './cargadores.service';

@Controller('cargadores')
export class CargadoresController {
  constructor(private readonly cargadoresService: CargadoresService) {}

  @Get()
  findAll() {
    return this.cargadoresService.findAll();
  }

  // Lo usa la app de usuario al escanear el QR del cargador.
  @Get(':numero_serie')
  findByNumeroSerie(@Param('numero_serie') numero_serie: string) {
    return this.cargadoresService.detallePublico(numero_serie);
  }

  @Post()
  registrar(
    @Body()
    body: {
      numero_serie: string;
      modelo: string;
      operador_id: string;
      ubicacion?: string;
      tarifa_por_kwh?: number | null;
    },
  ) {
    return this.cargadoresService.registrar(body);
  }

  @Patch(':numero_serie')
  actualizar(
    @Param('numero_serie') numero_serie: string,
    @Body() body: { ubicacion?: string; tarifa_por_kwh?: number | null; estado?: EstadoCargador },
  ) {
    return this.cargadoresService.actualizar(numero_serie, body);
  }
}
