import { Body, Controller, ForbiddenException, Get, Param, Patch, Post } from '@nestjs/common';
import { Rol, Roles, Usuario, UsuarioActual } from '../../comun/decoradores';
import { OperadoresService } from '../operadores/operadores.service';
import { UsuariosService } from './usuarios.service';

@Controller('usuarios')
export class UsuariosController {
  constructor(
    private readonly usuarios: UsuariosService,
    private readonly operadores: OperadoresService,
  ) {}

  @Roles('admin')
  @Get()
  listar() {
    return this.usuarios.listar();
  }

  @Roles('admin')
  @Post()
  crear(@Body() body: { email: string; nombre: string; password: string; rol: Rol; operador_id?: string }) {
    if (body.rol === 'operador' && body.operador_id) this.operadores.findOne(body.operador_id);
    return this.usuarios.crear(body);
  }

  @Roles('admin')
  @Patch(':id/activo')
  cambiarActivo(@Param('id') id: string, @Body() body: { activo: boolean }, @Usuario() yo: UsuarioActual) {
    return this.usuarios.cambiarActivo(id, body.activo, yo);
  }

  // Cada usuario cambia su propia clave; un admin puede cambiar la de cualquiera.
  @Patch(':id/clave')
  cambiarClave(@Param('id') id: string, @Body() body: { password: string }, @Usuario() yo: UsuarioActual) {
    if (yo.rol !== 'admin' && yo.id !== id) throw new ForbiddenException('Solo puedes cambiar tu propia clave');
    return this.usuarios.cambiarClave(id, body.password);
  }
}
