import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { alcanceOperador, alcanceZona, Roles, Usuario, UsuarioActual } from '../../comun/decoradores';
import { CargadoresService } from '../cargadores/cargadores.service';
import { OcppGatewayService } from './ocpp-gateway.service';

@Controller('ocpp')
export class OcppGatewayController {
  constructor(
    private readonly gateway: OcppGatewayService,
    private readonly cargadores: CargadoresService,
  ) {}

  // Admin ve todas las conexiones; un operador solo las de sus cargadores.
  @Get('conexiones')
  conexiones(@Usuario() usuario: UsuarioActual) {
    const series = this.cargadores.seriesVisibles(alcanceOperador(usuario), alcanceZona(usuario));
    return this.gateway.listarConexiones(series ? [...series] : null);
  }

  @Roles('admin')
  @Get('catalogo')
  catalogo(@Query('version') version?: string) {
    return this.gateway.catalogo(version === '2.0.1' ? '2.0.1' : '1.6');
  }

  @Roles('admin')
  @Get('mensajes')
  mensajes(
    @Query('numero_serie') numero_serie?: string,
    @Query('despues_de') despues_de?: string,
    @Query('limite') limite?: string,
  ) {
    return this.gateway.mensajes({
      numero_serie: numero_serie || undefined,
      despues_de: despues_de ? Number(despues_de) : undefined,
      limite: limite ? Number(limite) : undefined,
    });
  }

  @Roles('admin')
  @Post(':numero_serie/comandos')
  comando(@Param('numero_serie') numero_serie: string, @Body() body: { accion: string; payload?: unknown }) {
    return this.gateway.enviarComando(numero_serie, body.accion, body.payload ?? {});
  }
}
