import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Post } from '@nestjs/common';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { Publico, Usuario, UsuarioActual } from '../../comun/decoradores';
import { AuthService } from './auth.service';
import { HuellaService } from './huella.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly huella: HuellaService,
  ) {}

  @Publico()
  @HttpCode(200)
  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    return this.auth.login(body.email, body.password);
  }

  @Publico()
  @Post('registro')
  registro(@Body() body: { empresa: string; nombre: string; email: string; password: string }) {
    return this.auth.registrarOperador(body);
  }

  @Get('yo')
  yo(@Usuario() usuario: UsuarioActual) {
    return usuario;
  }

  // ---------- Huella (passkeys / WebAuthn) ----------

  @Get('huella')
  huellas(@Usuario() u: UsuarioActual) {
    return this.huella.listar(u.id);
  }

  @HttpCode(200)
  @Post('huella/registro/opciones')
  opcionesRegistro(@Usuario() u: UsuarioActual, @Headers('origin') origin?: string) {
    return this.huella.opcionesRegistro(u, origin);
  }

  @Post('huella/registro')
  registrarHuella(
    @Usuario() u: UsuarioActual,
    @Body() body: { respuesta: RegistrationResponseJSON; nombre?: string },
    @Headers('origin') origin?: string,
  ) {
    return this.huella.registrar(u, body.respuesta, body.nombre ?? '', origin);
  }

  @HttpCode(204)
  @Delete('huella/:id')
  eliminarHuella(@Usuario() u: UsuarioActual, @Param('id') id: string) {
    this.huella.eliminar(u.id, id);
  }

  @Publico()
  @HttpCode(200)
  @Post('huella/login/opciones')
  opcionesLogin(@Headers('origin') origin?: string) {
    return this.huella.opcionesLogin(origin);
  }

  @Publico()
  @HttpCode(200)
  @Post('huella/login')
  async loginHuella(@Body() body: { respuesta: AuthenticationResponseJSON }, @Headers('origin') origin?: string) {
    const usuario = await this.huella.verificarLogin(body.respuesta, origin);
    return { token: this.auth.emitirToken(usuario), usuario };
  }
}
