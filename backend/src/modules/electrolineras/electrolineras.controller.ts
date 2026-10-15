import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { alcanceOperador, alcanceZona, GESTION, Roles, Usuario, UsuarioActual } from '../../comun/decoradores';
import { ElectrolineasService, ElectrolineraRegistro } from './electrolineras.service';

type Cuerpo = Partial<Omit<ElectrolineraRegistro, 'id' | 'creado'>>;

@Controller('electrolineras')
export class ElectrolineasController {
  constructor(private readonly electrolineras: ElectrolineasService) {}

  @Get()
  listar(@Usuario() u: UsuarioActual) {
    return this.electrolineras.listar(alcanceOperador(u), alcanceZona(u));
  }

  @Get(':id')
  obtener(@Param('id') id: string, @Usuario() u: UsuarioActual) {
    return this.electrolineras.obtener(id, alcanceOperador(u));
  }

  @Roles(...GESTION)
  @Post()
  crear(@Body() body: Cuerpo, @Usuario() u: UsuarioActual) {
    return this.electrolineras.crear(body, alcanceOperador(u));
  }

  @Roles(...GESTION)
  @Patch(':id')
  actualizar(@Param('id') id: string, @Body() body: Cuerpo, @Usuario() u: UsuarioActual) {
    return this.electrolineras.actualizar(id, body, alcanceOperador(u));
  }

  @Roles(...GESTION)
  @HttpCode(204)
  @Delete(':id')
  eliminar(@Param('id') id: string, @Usuario() u: UsuarioActual) {
    this.electrolineras.eliminar(id, alcanceOperador(u));
  }
}
