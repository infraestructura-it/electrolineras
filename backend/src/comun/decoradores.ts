import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

export type Rol = 'admin' | 'operador';

// Usuario autenticado que el guard deja en request.usuario.
export interface UsuarioActual {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
  operador_id: string | null;
}

export const ES_PUBLICO = 'es_publico';
export const ROLES = 'roles';

// Ruta sin login (app de usuario final, login, registro).
export const Publico = () => SetMetadata(ES_PUBLICO, true);

// Restringe la ruta a ciertos roles. Sin este decorador basta con estar autenticado.
export const Roles = (...roles: Rol[]) => SetMetadata(ROLES, roles);

export const Usuario = createParamDecorator(
  (_dato: unknown, ctx: ExecutionContext): UsuarioActual => ctx.switchToHttp().getRequest().usuario,
);

// Para servicios: un admin ve todo; un operador solo lo de su operador_id.
export const alcanceOperador = (usuario?: UsuarioActual) =>
  usuario && usuario.rol === 'operador' ? usuario.operador_id : null;
