import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { AlmacenService } from '../../comun/almacen.service';
import { UsuarioActual } from '../../comun/decoradores';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { OperadoresService } from '../operadores/operadores.service';
import { UsuariosService } from '../usuarios/usuarios.service';

const DURACION_TOKEN_S = 12 * 60 * 60; // 12 horas
const DURACION_TOKEN_CONDUCTOR_S = 60 * 24 * 60 * 60; // 60 días: la app del conductor no pide entrar a cada rato

// Token propio y simple: base64url(payload).base64url(HMAC-SHA256).
// El secreto viene de JWT_SECRET o se genera una vez y se guarda en data/, así los
// reinicios del backend no cierran las sesiones abiertas.
@Injectable()
export class AuthService {
  private readonly secreto: string;

  constructor(
    almacen: AlmacenService,
    private readonly usuarios: UsuariosService,
    private readonly operadores: OperadoresService,
    private readonly configuracion: ConfiguracionService,
  ) {
    let secreto = process.env.JWT_SECRET || almacen.leer<string>('secreto', '');
    if (!secreto) {
      secreto = randomBytes(32).toString('hex');
      almacen.guardar('secreto', secreto);
    }
    this.secreto = secreto;
  }

  login(email: string, password: string) {
    const usuario = this.usuarios.verificarCredenciales(email, password);
    if (!usuario) throw new UnauthorizedException('Correo o clave incorrectos');
    return { token: this.firmar(usuario), usuario };
  }

  // Autorregistro de un operador: crea el operador (empresa) y su primer usuario.
  registrarOperador(data: { empresa: string; nombre: string; email: string; password: string }) {
    if (!this.configuracion.obtener().permitir_registro_operadores) {
      throw new ForbiddenException('El registro de operadores está deshabilitado. Pide acceso al administrador.');
    }
    if (!data.empresa?.trim()) throw new BadRequestException('Escribe el nombre de la empresa o conjunto');
    const operador = this.operadores.create({ nombre: data.empresa.trim(), email_contacto: data.email });
    try {
      const usuario = this.usuarios.crear({ ...data, rol: 'administrador', operador_id: operador.id });
      return { token: this.firmar(usuario), usuario };
    } catch (e) {
      this.operadores.eliminar(operador.id); // no dejar un operador huérfano si falla el usuario
      throw e;
    }
  }

  // Token de sesión para un usuario ya autenticado por otro medio (huella).
  emitirToken(usuario: UsuarioActual) {
    return this.firmar(usuario);
  }

  verificar(token: string): UsuarioActual | null {
    const [cuerpo, firma] = token.split('.');
    if (!cuerpo || !firma) return null;
    const esperada = Buffer.from(this.hmac(cuerpo));
    const recibida = Buffer.from(firma);
    if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
    try {
      const { sub, exp, tipo } = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'));
      if (typeof exp !== 'number' || exp < Date.now() / 1000) return null;
      if (tipo === 'conductor') return null; // un token de la app del conductor no abre el panel
      return this.usuarios.obtenerActivo(sub); // datos y rol siempre actualizados
    } catch {
      return null;
    }
  }

  // ---------- Tokens de la app del conductor (mismo esquema, con tipo "conductor") ----------

  firmarConductor(conductor: { id: string; email: string }) {
    const cuerpo = Buffer.from(
      JSON.stringify({ sub: conductor.id, email: conductor.email, tipo: 'conductor', exp: Math.floor(Date.now() / 1000) + DURACION_TOKEN_CONDUCTOR_S }),
    ).toString('base64url');
    return `${cuerpo}.${this.hmac(cuerpo)}`;
  }

  verificarConductor(token: string): { id: string; email: string } | null {
    const [cuerpo, firma] = token.split('.');
    if (!cuerpo || !firma) return null;
    const esperada = Buffer.from(this.hmac(cuerpo));
    const recibida = Buffer.from(firma);
    if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
    try {
      const { sub, email, exp, tipo } = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'));
      if (tipo !== 'conductor' || typeof exp !== 'number' || exp < Date.now() / 1000) return null;
      return { id: sub, email };
    } catch {
      return null;
    }
  }

  private firmar(usuario: UsuarioActual) {
    const cuerpo = Buffer.from(
      JSON.stringify({ sub: usuario.id, exp: Math.floor(Date.now() / 1000) + DURACION_TOKEN_S }),
    ).toString('base64url');
    return `${cuerpo}.${this.hmac(cuerpo)}`;
  }

  private hmac(texto: string) {
    return createHmac('sha256', this.secreto).update(texto).digest('base64url');
  }
}
