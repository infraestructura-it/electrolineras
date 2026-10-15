import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { OperadoresModule } from '../operadores/operadores.module';
import { ZonasModule } from '../zonas/zonas.module';
import { UsuariosService } from '../usuarios/usuarios.service';
import { UsuariosController } from '../usuarios/usuarios.controller';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';

@Module({
  imports: [OperadoresModule, ZonasModule],
  controllers: [AuthController, UsuariosController],
  providers: [UsuariosService, AuthService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [UsuariosService, AuthService],
})
export class AuthModule {}
