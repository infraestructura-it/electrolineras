import { Controller, Get, Post, Param, Body, Query, HttpCode } from '@nestjs/common';
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
  ) {}

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
  iniciar(@Body() body: { cargador_id?: string; numero_serie?: string; usuario_id: string }) {
    return this.sesionesService.iniciar(body);
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
  pagar(@Param('id') id: string) {
    return this.sesionesService.pagar(id);
  }
}
