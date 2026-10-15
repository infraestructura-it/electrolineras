import { Controller, Get, Post, Param, Body, Query, HttpCode, Headers } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { alcanceOperador, alcanceZona, Publico, Usuario, UsuarioActual } from '../../comun/decoradores';
import { CargadoresService } from '../cargadores/cargadores.service';
import { SesionesService } from './sesiones.service';

// Las rutas de una sesión concreta son públicas: la app del usuario final las usa sin
// login y el id (UUID) no es adivinable. El listado y las estadísticas exigen login.
@Controller()
export class SesionesController {
  constructor(
    private readonly sesionesService: SesionesService,
    private readonly cargadores: CargadoresService,
    private readonly auth: AuthService,
  ) {}

  // Conductor de la app (token propio, distinto al del panel), si viene en la petición.
  private conductor(authorization?: string) {
    const [tipo, token] = String(authorization ?? '').split(' ');
    return tipo === 'Bearer' && token ? this.auth.verificarConductor(token) : null;
  }

  private series(u: UsuarioActual) {
    return alcanceZona(u) ? this.cargadores.seriesVisibles(alcanceOperador(u), alcanceZona(u)) : null;
  }

  @Get('sesiones')
  listar(@Usuario() usuario: UsuarioActual) {
    return this.sesionesService.listar(alcanceOperador(usuario), this.series(usuario));
  }

  @Get('estadisticas')
  estadisticas(@Usuario() usuario: UsuarioActual, @Query('dias') dias?: string) {
    const n = Math.min(Math.max(Number(dias) || 14, 1), 90);
    return this.sesionesService.estadisticas(alcanceOperador(usuario), n, this.series(usuario));
  }

  @Publico()
  @Get('sesiones/:id')
  obtener(@Param('id') id: string) {
    return this.sesionesService.obtener(id);
  }

  // Se identifica el cargador por numero_serie (desde el QR) o por cargador_id.
  @Publico()
  @Post('sesiones')
  iniciar(
    @Body() body: { cargador_id?: string; numero_serie?: string; usuario_id: string },
    @Headers('authorization') authorization?: string,
  ) {
    return this.sesionesService.iniciar(body, this.conductor(authorization));
  }

  @Publico()
  @HttpCode(200)
  @Post('sesiones/:id/finalizar')
  finalizar(@Param('id') id: string, @Body() body: { kwh_consumidos?: number }) {
    return this.sesionesService.finalizar(id, body?.kwh_consumidos);
  }

  @Publico()
  @HttpCode(200)
  @Post('sesiones/:id/pagar')
  pagar(@Param('id') id: string, @Body() body: { usar_puntos?: boolean }, @Headers('authorization') authorization?: string) {
    return this.sesionesService.pagar(id, { usar_puntos: Boolean(body?.usar_puntos), conductor_id: this.conductor(authorization)?.id ?? null });
  }
}
