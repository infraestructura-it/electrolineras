import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'crypto';
import { AlmacenService } from '../../comun/almacen.service';
import { Rol, ROLES_VALIDOS, UsuarioActual } from '../../comun/decoradores';

interface UsuarioRegistro extends UsuarioActual {
  activo: boolean;
  creado: string;
  sal: string;
  hash: string;
}

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LONGITUD_MIN_CLAVE = 8;

@Injectable()
export class UsuariosService implements OnModuleInit {
  private readonly logger = new Logger(UsuariosService.name);
  private readonly usuarios = new Map<string, UsuarioRegistro>();

  constructor(private readonly almacen: AlmacenService) {
    let migrados = 0;
    for (const u of this.almacen.leer<UsuarioRegistro[]>('usuarios', [])) {
      // Versiones anteriores tenían el rol "operador" (usuario de una empresa): ahora es su administrador.
      if ((u.rol as string) === 'operador') {
        u.rol = 'administrador';
        migrados++;
      }
      if (u.zona_id === undefined) u.zona_id = null;
      this.usuarios.set(u.id, u);
    }
    if (migrados) {
      this.persistir();
      this.logger.log(`${migrados} usuario(s) con rol "operador" pasaron a "administrador" de su empresa.`);
    }
  }

  // Garantiza que exista un administrador.
  // - Con ADMIN_EMAIL / ADMIN_PASSWORD: crea ese admin o le restablece la clave (sirve para recuperar acceso).
  // - Sin variables y sin ningún admin: crea admin@electrolineras.local con clave aleatoria y la muestra en el log.
  onModuleInit() {
    const email = (process.env.ADMIN_EMAIL || 'admin@electrolineras.local').toLowerCase();
    const claveEnv = process.env.ADMIN_PASSWORD;
    const existente = this.buscarPorEmail(email);

    if (claveEnv) {
      if (existente) {
        Object.assign(existente, this.hashear(claveEnv), { rol: 'admin', activo: true });
        this.persistir();
      } else {
        this.crear({ email, nombre: 'Administrador', password: claveEnv, rol: 'admin' });
      }
      this.logger.log(`Administrador ${email} listo (clave tomada de ADMIN_PASSWORD).`);
      return;
    }

    if (![...this.usuarios.values()].some((u) => u.rol === 'admin')) {
      const clave = randomBytes(9).toString('base64url');
      this.crear({ email, nombre: 'Administrador', password: clave, rol: 'admin' });
      this.logger.warn('==================================================================');
      this.logger.warn(` Administrador inicial creado: ${email}`);
      this.logger.warn(` Clave: ${clave}`);
      this.logger.warn(' Cámbiala desde el panel (Usuarios) después de entrar.');
      this.logger.warn('==================================================================');
    }
  }

  // alcance: null = todos (admin de plataforma); un operador_id = solo los usuarios de esa empresa.
  listar(alcance: string | null = null): UsuarioActual[] {
    return [...this.usuarios.values()].filter((u) => !alcance || u.operador_id === alcance).map((u) => this.publico(u));
  }

  crear(data: { email: string; nombre: string; password: string; rol: Rol; operador_id?: string | null; zona_id?: string | null }) {
    const email = String(data.email ?? '').trim().toLowerCase();
    if (!EMAIL_VALIDO.test(email)) throw new BadRequestException('Escribe un correo válido');
    if (this.buscarPorEmail(email)) throw new ConflictException('Ya existe un usuario con ese correo');
    if (!data.nombre?.trim()) throw new BadRequestException('El nombre es obligatorio');
    this.validarClave(data.password);
    if (!ROLES_VALIDOS.includes(data.rol)) throw new BadRequestException('Rol inválido');
    if (data.rol !== 'admin' && !data.operador_id) {
      throw new BadRequestException('Un administrador de empresa u operario debe estar vinculado a una empresa');
    }

    const usuario: UsuarioRegistro = {
      id: randomUUID(),
      email,
      nombre: data.nombre.trim(),
      rol: data.rol,
      operador_id: data.rol === 'admin' ? null : data.operador_id ?? null,
      zona_id: data.rol === 'operario' ? data.zona_id ?? null : null,
      activo: true,
      creado: new Date().toISOString(),
      ...this.hashear(data.password),
    };
    this.usuarios.set(usuario.id, usuario);
    this.persistir();
    return this.publico(usuario);
  }

  // Devuelve el usuario si email y clave son correctos y está activo; si no, null.
  verificarCredenciales(email: string, password: string): UsuarioActual | null {
    const usuario = this.buscarPorEmail(String(email ?? '').trim().toLowerCase());
    if (!usuario || !usuario.activo || typeof password !== 'string') return null;
    const calculado = scryptSync(password, usuario.sal, 64);
    const guardado = Buffer.from(usuario.hash, 'hex');
    if (calculado.length !== guardado.length || !timingSafeEqual(calculado, guardado)) return null;
    return this.publico(usuario);
  }

  obtenerActivo(id: string): UsuarioActual | null {
    const usuario = this.usuarios.get(id);
    return usuario && usuario.activo ? this.publico(usuario) : null;
  }

  cambiarClave(id: string, password: string) {
    const usuario = this.usuarios.get(id);
    if (!usuario) throw new NotFoundException('No existe el usuario');
    this.validarClave(password);
    Object.assign(usuario, this.hashear(password));
    this.persistir();
    return this.publico(usuario);
  }

  // Usuario por id, verificando que pertenezca a la empresa del solicitante (alcance).
  obtener(id: string, alcance: string | null = null): UsuarioActual {
    const usuario = this.usuarios.get(id);
    if (!usuario || (alcance && usuario.operador_id !== alcance)) throw new NotFoundException('No existe el usuario');
    return this.publico(usuario);
  }

  // Rol y zona de un usuario existente (la empresa no cambia).
  actualizar(id: string, cambios: { nombre?: string; rol?: Rol; zona_id?: string | null }, solicitante: UsuarioActual, alcance: string | null) {
    const usuario = this.usuarios.get(id);
    if (!usuario || (alcance && usuario.operador_id !== alcance)) throw new NotFoundException('No existe el usuario');
    if (cambios.nombre !== undefined) {
      if (!cambios.nombre.trim()) throw new BadRequestException('El nombre es obligatorio');
      usuario.nombre = cambios.nombre.trim();
    }
    if (cambios.rol !== undefined && cambios.rol !== usuario.rol) {
      if (!ROLES_VALIDOS.includes(cambios.rol)) throw new BadRequestException('Rol inválido');
      if (usuario.id === solicitante.id) throw new BadRequestException('No puedes cambiar tu propio rol');
      if ((cambios.rol === 'admin') !== (usuario.rol === 'admin')) {
        throw new BadRequestException('Un administrador de plataforma no se convierte en usuario de empresa ni al revés: crea otro usuario');
      }
      usuario.rol = cambios.rol;
    }
    if (cambios.zona_id !== undefined) usuario.zona_id = usuario.rol === 'operario' ? cambios.zona_id || null : null;
    if (usuario.rol !== 'operario') usuario.zona_id = null;
    this.persistir();
    return this.publico(usuario);
  }

  cambiarActivo(id: string, activo: boolean, solicitante: UsuarioActual, alcance: string | null = null) {
    const usuario = this.usuarios.get(id);
    if (!usuario || (alcance && usuario.operador_id !== alcance)) throw new NotFoundException('No existe el usuario');
    if (usuario.id === solicitante.id && !activo) throw new BadRequestException('No puedes desactivar tu propio usuario');
    usuario.activo = Boolean(activo);
    this.persistir();
    return this.publico(usuario);
  }

  private buscarPorEmail(email: string) {
    return [...this.usuarios.values()].find((u) => u.email === email);
  }

  private validarClave(password: string) {
    if (typeof password !== 'string' || password.length < LONGITUD_MIN_CLAVE) {
      throw new BadRequestException(`La clave debe tener al menos ${LONGITUD_MIN_CLAVE} caracteres`);
    }
  }

  private hashear(password: string) {
    const sal = randomBytes(16).toString('hex');
    return { sal, hash: scryptSync(password, sal, 64).toString('hex') };
  }

  private publico(u: UsuarioRegistro): UsuarioActual & { activo: boolean; creado: string } {
    return {
      id: u.id,
      email: u.email,
      nombre: u.nombre,
      rol: u.rol,
      operador_id: u.operador_id,
      zona_id: u.zona_id ?? null,
      activo: u.activo,
      creado: u.creado,
    };
  }

  private persistir() {
    this.almacen.guardar('usuarios', [...this.usuarios.values()]);
  }
}
