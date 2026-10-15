import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { alcanceOperador, GESTION, Roles, Usuario, UsuarioActual } from '../../comun/decoradores';
import { LicenciasService } from './licencias.service';

@Controller('licencias')
export class LicenciasController {
  constructor(private readonly licencias: LicenciasService) {}

  // Estado de la licencia de cada empresa visible (también lo usa el aviso del panel).
  @Get()
  resumen(@Usuario() u: UsuarioActual) {
    return this.licencias.resumen(alcanceOperador(u));
  }

  @Roles(...GESTION)
  @Post()
  activar(@Body() body: { licencia: string }, @Usuario() u: UsuarioActual) {
    return this.licencias.activar(body.licencia, alcanceOperador(u));
  }

  @Roles('admin')
  @HttpCode(204)
  @Delete(':id')
  eliminar(@Param('id') id: string) {
    this.licencias.eliminar(id);
  }
}
