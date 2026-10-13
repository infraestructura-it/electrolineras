import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Publico, Usuario, UsuarioActual } from '../../comun/decoradores';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

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
}
