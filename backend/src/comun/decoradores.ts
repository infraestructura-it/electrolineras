import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

// Jerarquía: Plataforma (admin) → Zona → Empresa (operador) → Administrador de empresa / Operario.
// - admin:          administrador de la plataforma (IIT); ve y gestiona todo.
// - administrador:  administrador de una empresa; gestiona sus electrolineras, cargadores y usuarios.
// - operario:       personal de una empresa; opera (monitor, sesiones, detener) sin configurar.
//                   Con zona_id solo ve las electrolineras de esa zona.
export type Rol = 'admin' | 'administrador' | 'operario';
export const ROLES_VALIDOS: Rol[] = ['admin', 'administrador', 'operario'];
// Roles que pueden crear o cambiar datos de su empresa.
export const GESTION: Rol[] = ['admin', 'administrador'];

// Usuario autenticado que el guard deja en request.usuario.
export interface UsuarioActual {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
  operador_id: string | null; // empresa
  zona_id: string | null; // solo operario (opcional)
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

// Para servicios: el admin de plataforma ve todo (null); los demás, solo su empresa.
export const alcanceOperador = (usuario?: UsuarioActual) =>
  usuario && usuario.rol !== 'admin' ? usuario.operador_id : null;

// Zona a la que está limitado un operario (null = sin límite de zona).
export const alcanceZona = (usuario?: UsuarioActual) =>
  usuario && usuario.rol === 'operario' ? usuario.zona_id ?? null : null;
