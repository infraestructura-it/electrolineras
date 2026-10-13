import { Controller, Get, Post, Patch, Delete, Param, Body, HttpCode } from '@nestjs/common';
import { alcanceOperador, Publico, Usuario, UsuarioActual } from '../../comun/decoradores';
import { CargadoresService, EstadoCargador } from './cargadores.service';

@Controller('cargadores')
export class CargadoresController {
  constructor(private readonly cargadoresService: CargadoresService) {}

  @Get()
  findAll(@Usuario() usuario: UsuarioActual) {
    return this.cargadoresService.findAll(alcanceOperador(usuario));
  }

  // Lo usa la app de usuario al escanear el QR del cargador: sin login.
  @Publico()
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
    @Usuario() usuario: UsuarioActual,
  ) {
    return this.cargadoresService.registrar(body, alcanceOperador(usuario));
  }

  @Patch(':numero_serie')
  actualizar(
    @Param('numero_serie') numero_serie: string,
    @Body() body: { ubicacion?: string; tarifa_por_kwh?: number | null; estado?: EstadoCargador },
    @Usuario() usuario: UsuarioActual,
  ) {
    return this.cargadoresService.actualizar(numero_serie, body, alcanceOperador(usuario));
  }

  @HttpCode(204)
  @Delete(':numero_serie')
  eliminar(@Param('numero_serie') numero_serie: string, @Usuario() usuario: UsuarioActual) {
    this.cargadoresService.eliminar(numero_serie, alcanceOperador(usuario));
  }
}
