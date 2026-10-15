import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Patch, Post } from '@nestjs/common';
import { alcanceOperador, GESTION, Rol, Roles, Usuario, UsuarioActual } from '../../comun/decoradores';
import { OperadoresService } from '../operadores/operadores.service';
import { ZonasService } from '../zonas/zonas.service';
import { UsuariosService } from './usuarios.service';

// El admin de plataforma gestiona todos los usuarios; un administrador de empresa, solo los de
// su empresa (administradores y operarios), nunca administradores de plataforma.
@Controller('usuarios')
export class UsuariosController {
  constructor(
    private readonly usuarios: UsuariosService,
    private readonly operadores: OperadoresService,
    private readonly zonas: ZonasService,
  ) {}

  @Roles(...GESTION)
  @Get()
  listar(@Usuario() yo: UsuarioActual) {
    return this.usuarios.listar(alcanceOperador(yo));
  }

  @Roles(...GESTION)
  @Post()
  crear(
    @Body() body: { email: string; nombre: string; password: string; rol: Rol; operador_id?: string; zona_id?: string | null },
    @Usuario() yo: UsuarioActual,
  ) {
    const alcance = alcanceOperador(yo);
    if (alcance) {
      if (body.rol === 'admin') throw new ForbiddenException('Solo la plataforma crea administradores de plataforma');
      body.operador_id = alcance; // siempre en su propia empresa
    }
    if (body.rol !== 'admin') {
      if (!body.operador_id) throw new BadRequestException('Elige la empresa del usuario');
      this.operadores.findOne(body.operador_id);
    }
    const zona_id = body.rol === 'operario' ? this.zonas.validarOpcional(body.zona_id) : null;
    return this.usuarios.crear({ ...body, zona_id });
  }

  @Roles(...GESTION)
  @Patch(':id')
  actualizar(
    @Param('id') id: string,
    @Body() body: { nombre?: string; rol?: Rol; zona_id?: string | null },
    @Usuario() yo: UsuarioActual,
  ) {
    const alcance = alcanceOperador(yo);
    if (alcance && body.rol === 'admin') throw new ForbiddenException('No puedes asignar ese rol');
    const zona_id = body.zona_id === undefined ? undefined : this.zonas.validarOpcional(body.zona_id);
    return this.usuarios.actualizar(id, { ...body, zona_id }, yo, alcance);
  }

  @Roles(...GESTION)
  @Patch(':id/activo')
  cambiarActivo(@Param('id') id: string, @Body() body: { activo: boolean }, @Usuario() yo: UsuarioActual) {
    return this.usuarios.cambiarActivo(id, body.activo, yo, alcanceOperador(yo));
  }

  // Cada usuario cambia su propia clave; el admin de plataforma, la de cualquiera; un
  // administrador de empresa, la de los usuarios de su empresa.
  @Patch(':id/clave')
  cambiarClave(@Param('id') id: string, @Body() body: { password: string }, @Usuario() yo: UsuarioActual) {
    if (yo.id !== id) {
      if (yo.rol === 'operario') throw new ForbiddenException('Solo puedes cambiar tu propia clave');
      this.usuarios.obtener(id, alcanceOperador(yo));
    }
    return this.usuarios.cambiarClave(id, body.password);
  }
}
