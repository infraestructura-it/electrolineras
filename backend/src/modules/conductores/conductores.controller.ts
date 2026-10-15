import { Body, Controller, Get, Headers, HttpCode, Param, Post, UnauthorizedException } from '@nestjs/common';
import { Publico } from '../../comun/decoradores';
import { AuthService } from '../auth/auth.service';
import { CargadoresService } from '../cargadores/cargadores.service';
import { SesionesService } from '../sesiones/sesiones.service';
import { ConductoresService } from './conductores.service';
import { PuntosService } from './puntos.service';

// App del conductor. Rutas públicas para el guard del panel: el token del conductor se
// valida aquí (tipo "conductor"), no da acceso a ninguna ruta del panel.
@Controller('conductor')
export class ConductoresController {
  constructor(
    private readonly conductores: ConductoresService,
    private readonly puntos: PuntosService,
    private readonly sesiones: SesionesService,
    private readonly cargadores: CargadoresService,
    private readonly auth: AuthService,
  ) {}

  private actual(authorization?: string, obligatorio = true) {
    const [tipo, token] = String(authorization ?? '').split(' ');
    const c = tipo === 'Bearer' && token ? this.auth.verificarConductor(token) : null;
    if (!c && obligatorio) throw new UnauthorizedException('Inicia sesión en la app');
    return c;
  }

  private conToken(conductor: { id: string; email: string; nombre: string }) {
    return { token: this.auth.firmarConductor(conductor), conductor };
  }

  @Publico()
  @Post('registro')
  registro(@Body() body: { nombre?: string; email?: string; celular?: string; password?: string }) {
    return this.conToken(this.conductores.registrar(body ?? {}));
  }

  @Publico()
  @HttpCode(200)
  @Post('login')
  login(@Body() body: { email?: string; password?: string }) {
    return this.conToken(this.conductores.validar(body?.email ?? '', body?.password ?? ''));
  }

  @Publico()
  @Get('yo')
  yo(@Headers('authorization') authorization?: string) {
    const c = this.actual(authorization)!;
    const conductor = this.conductores.obtener(c.id);
    const r = this.puntos.resumen(c.id);
    return { ...conductor, saldo_puntos: r.saldo_total, valor_puntos_cop: r.valor_total_cop };
  }

  @Publico()
  @Get('cargas')
  cargas(@Headers('authorization') authorization?: string) {
    return this.sesiones.porConductor(this.actual(authorization)!.id);
  }

  @Publico()
  @Get('puntos')
  resumen(@Headers('authorization') authorization?: string) {
    return this.puntos.resumen(this.actual(authorization)!.id);
  }

  // Programa de puntos del cargador (lo muestra la pantalla del QR); con token, el saldo del conductor.
  @Publico()
  @Get('programa/:numero_serie')
  programa(@Param('numero_serie') numero_serie: string, @Headers('authorization') authorization?: string) {
    const cargador = this.cargadores.findByNumeroSerie(numero_serie);
    return this.puntos.programaDe(cargador.operador_id, this.actual(authorization, false)?.id ?? null);
  }
}
