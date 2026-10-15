import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../../comun/decoradores';
import { ZonasService } from './zonas.service';

@Controller('zonas')
export class ZonasController {
  constructor(private readonly zonas: ZonasService) {}

  @Get()
  listar() {
    return this.zonas.listar();
  }

  @Roles('admin')
  @Post()
  crear(@Body() body: { nombre: string; descripcion?: string }) {
    return this.zonas.crear(body);
  }

  @Roles('admin')
  @Patch(':id')
  actualizar(@Param('id') id: string, @Body() body: { nombre?: string; descripcion?: string }) {
    return this.zonas.actualizar(id, body);
  }

  @Roles('admin')
  @HttpCode(204)
  @Delete(':id')
  eliminar(@Param('id') id: string) {
    this.zonas.eliminar(id);
  }
}
