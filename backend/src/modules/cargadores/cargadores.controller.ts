import { Controller, Get, Post, Patch, Delete, Param, Body, HttpCode } from '@nestjs/common';
import { alcanceOperador, alcanceZona, GESTION, Publico, Roles, Usuario, UsuarioActual } from '../../comun/decoradores';
import { CargadoresService, EstadoCargador, VersionOcpp } from './cargadores.service';

type Cuerpo = {
  numero_serie?: string;
  modelo?: string;
  operador_id?: string;
  ubicacion?: string;
  tarifa_por_kwh?: number | null;
  electrolinera_id?: string | null;
  version_ocpp?: VersionOcpp;
  potencia_kw?: number;
  estado?: EstadoCargador;
};

@Controller('cargadores')
export class CargadoresController {
  constructor(private readonly cargadoresService: CargadoresService) {}

  @Get()
  findAll(@Usuario() usuario: UsuarioActual) {
    return this.cargadoresService.findAll(alcanceOperador(usuario), alcanceZona(usuario));
  }

  // Lo usa la app de usuario al escanear el QR del cargador: sin login.
  @Publico()
  @Get(':numero_serie')
  findByNumeroSerie(@Param('numero_serie') numero_serie: string) {
    return this.cargadoresService.detallePublico(numero_serie);
  }

  @Roles(...GESTION)
  @Post()
  registrar(@Body() body: Cuerpo, @Usuario() usuario: UsuarioActual) {
    return this.cargadoresService.registrar(body, alcanceOperador(usuario));
  }

  @Roles(...GESTION)
  @Patch(':numero_serie')
  actualizar(@Param('numero_serie') numero_serie: string, @Body() body: Cuerpo, @Usuario() usuario: UsuarioActual) {
    return this.cargadoresService.actualizar(numero_serie, body, alcanceOperador(usuario));
  }

  @Roles(...GESTION)
  @HttpCode(204)
  @Delete(':numero_serie')
  eliminar(@Param('numero_serie') numero_serie: string, @Usuario() usuario: UsuarioActual) {
    this.cargadoresService.eliminar(numero_serie, alcanceOperador(usuario));
  }
}
