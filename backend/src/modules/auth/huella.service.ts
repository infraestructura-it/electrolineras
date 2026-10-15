import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type { AuthenticationResponseJSON, AuthenticatorTransportFuture, RegistrationResponseJSON } from '@simplewebauthn/server';
import { randomUUID } from 'crypto';
import { AlmacenService } from '../../comun/almacen.service';
import { UsuarioActual } from '../../comun/decoradores';
import { UsuariosService } from '../usuarios/usuarios.service';

// Inicio de sesión con huella (o rostro / PIN del dispositivo) usando passkeys (WebAuthn).
// La huella nunca sale del celular o del PC: el dispositivo firma un reto con una llave privada
// que guarda en su hardware, y aquí solo se guarda la llave pública.
// Los navegadores solo lo permiten en HTTPS o en http://localhost.

interface Credencial {
  id: string; // credentialID (base64url)
  usuario_id: string;
  llave_publica: string; // base64url
  contador: number;
  transportes: AuthenticatorTransportFuture[];
  nombre: string; // "Celular de Ana", "PC recepción"
  creado: string;
  ultimo_uso: string | null;
}

const VIGENCIA_RETO_MS = 5 * 60_000;

@Injectable()
export class HuellaService {
  private readonly credenciales = new Map<string, Credencial>();
  private readonly retosRegistro = new Map<string, { reto: string; vence: number }>(); // por usuario
  private readonly retosLogin = new Map<string, number>(); // reto → vencimiento

  constructor(
    private readonly almacen: AlmacenService,
    private readonly usuarios: UsuariosService,
  ) {
    for (const c of this.almacen.leer<Credencial[]>('credenciales-huella', [])) this.credenciales.set(c.id, c);
  }

  // Origen de la página (cabecera Origin) y su dominio (rpID). WebAuthn exige HTTPS salvo en localhost.
  origen(origin: string | undefined) {
    let url: URL;
    try {
      url = new URL(String(origin));
    } catch {
      throw new BadRequestException('No se pudo identificar el origen de la página');
    }
    const local = ['localhost', '127.0.0.1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !local) {
      throw new BadRequestException('La huella solo funciona cuando el panel se abre por HTTPS (con dominio y certificado).');
    }
    return { origen: url.origin, rpID: url.hostname };
  }

  listar(usuario_id: string) {
    return [...this.credenciales.values()]
      .filter((c) => c.usuario_id === usuario_id)
      .map(({ id, nombre, creado, ultimo_uso }) => ({ id, nombre, creado, ultimo_uso }));
  }

  eliminar(usuario_id: string, id: string) {
    const c = this.credenciales.get(id);
    if (!c || c.usuario_id !== usuario_id) throw new NotFoundException('No existe esa huella');
    this.credenciales.delete(id);
    this.persistir();
  }

  async opcionesRegistro(usuario: UsuarioActual, origin: string | undefined) {
    const { rpID } = this.origen(origin);
    const opciones = await generateRegistrationOptions({
      rpName: 'Electrolineras',
      rpID,
      userName: usuario.email,
      userDisplayName: usuario.nombre,
      userID: new TextEncoder().encode(usuario.id),
      attestationType: 'none',
      // Llave guardada en el dispositivo (residente) y verificación del usuario (huella/rostro/PIN).
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      excludeCredentials: this.deUsuario(usuario.id).map((c) => ({ id: c.id, transports: c.transportes })),
    });
    this.retosRegistro.set(usuario.id, { reto: opciones.challenge, vence: Date.now() + VIGENCIA_RETO_MS });
    return opciones;
  }

  async registrar(usuario: UsuarioActual, respuesta: RegistrationResponseJSON, nombre: string, origin: string | undefined) {
    const { origen, rpID } = this.origen(origin);
    const pendiente = this.retosRegistro.get(usuario.id);
    this.retosRegistro.delete(usuario.id);
    if (!pendiente || pendiente.vence < Date.now()) throw new BadRequestException('El registro expiró. Inténtalo de nuevo.');
    let verificacion;
    try {
      verificacion = await verifyRegistrationResponse({
        response: respuesta,
        expectedChallenge: pendiente.reto,
        expectedOrigin: origen,
        expectedRPID: rpID,
        requireUserVerification: true,
      });
    } catch (e) {
      throw new BadRequestException(`No se pudo registrar la huella: ${(e as Error).message}`);
    }
    if (!verificacion.verified) throw new BadRequestException('No se pudo verificar la huella');
    const { credential } = verificacion.registrationInfo;
    const c: Credencial = {
      id: credential.id,
      usuario_id: usuario.id,
      llave_publica: Buffer.from(credential.publicKey).toString('base64url'),
      contador: credential.counter,
      transportes: credential.transports ?? respuesta.response.transports ?? [],
      nombre: nombre?.trim().slice(0, 60) || 'Dispositivo',
      creado: new Date().toISOString(),
      ultimo_uso: null,
    };
    this.credenciales.set(c.id, c);
    this.persistir();
    return { id: c.id, nombre: c.nombre, creado: c.creado, ultimo_uso: null };
  }

  // Sin usuario: el dispositivo ofrece las passkeys que tenga para este dominio.
  async opcionesLogin(origin: string | undefined) {
    const { rpID } = this.origen(origin);
    const opciones = await generateAuthenticationOptions({ rpID, userVerification: 'required' });
    const ahora = Date.now();
    for (const [reto, vence] of this.retosLogin) if (vence < ahora) this.retosLogin.delete(reto);
    this.retosLogin.set(opciones.challenge, ahora + VIGENCIA_RETO_MS);
    return opciones;
  }

  async verificarLogin(respuesta: AuthenticationResponseJSON, origin: string | undefined): Promise<UsuarioActual> {
    const { origen, rpID } = this.origen(origin);
    const c = this.credenciales.get(respuesta?.id);
    if (!c) throw new UnauthorizedException('Esta huella no está registrada. Entra con tu clave y regístrala en Mi cuenta.');
    let verificacion;
    try {
      verificacion = await verifyAuthenticationResponse({
        response: respuesta,
        // El reto debe ser uno emitido por este servidor y aún vigente (y se usa una sola vez).
        expectedChallenge: (reto: string) => {
          const vence = this.retosLogin.get(reto);
          this.retosLogin.delete(reto);
          return Boolean(vence && vence >= Date.now());
        },
        expectedOrigin: origen,
        expectedRPID: rpID,
        credential: { id: c.id, publicKey: new Uint8Array(Buffer.from(c.llave_publica, 'base64url')), counter: c.contador, transports: c.transportes },
        requireUserVerification: true,
      });
    } catch (e) {
      throw new UnauthorizedException(`No se pudo verificar la huella: ${(e as Error).message}`);
    }
    if (!verificacion.verified) throw new UnauthorizedException('No se pudo verificar la huella');
    const usuario = this.usuarios.obtenerActivo(c.usuario_id);
    if (!usuario) throw new UnauthorizedException('El usuario de esta huella está desactivado');
    c.contador = verificacion.authenticationInfo.newCounter;
    c.ultimo_uso = new Date().toISOString();
    this.persistir();
    return usuario;
  }

  private deUsuario(usuario_id: string) {
    return [...this.credenciales.values()].filter((c) => c.usuario_id === usuario_id);
  }

  private persistir() {
    this.almacen.guardar('credenciales-huella', [...this.credenciales.values()]);
  }
}
