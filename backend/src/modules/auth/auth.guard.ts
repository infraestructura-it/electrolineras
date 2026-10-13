import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ES_PUBLICO, Rol, ROLES } from '../../comun/decoradores';
import { AuthService } from './auth.service';

// Guard global: toda ruta exige "Authorization: Bearer <token>" salvo las marcadas con @Publico().
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const objetivos = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(ES_PUBLICO, objetivos)) return true;

    const request = ctx.switchToHttp().getRequest();
    const [tipo, token] = String(request.headers.authorization ?? '').split(' ');
    if (tipo !== 'Bearer' || !token) throw new UnauthorizedException('Inicia sesión para continuar');
    const usuario = this.auth.verificar(token);
    if (!usuario) throw new UnauthorizedException('Tu sesión expiró. Vuelve a iniciar sesión.');
    request.usuario = usuario;

    const roles = this.reflector.getAllAndOverride<Rol[]>(ROLES, objetivos);
    if (roles?.length && !roles.includes(usuario.rol)) {
      throw new ForbiddenException('No tienes permiso para esta acción');
    }
    return true;
  }
}
