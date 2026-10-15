import { Controller, Get } from '@nestjs/common';
import { alcanceOperador, alcanceZona, Publico, Usuario, UsuarioActual } from '../../comun/decoradores';
import { MonitorService } from './monitor.service';

@Controller()
export class MonitorController {
  constructor(private readonly monitor: MonitorService) {}

  // Tablero en vivo del panel (admin: todo; empresa: lo suyo; operario con zona: su zona).
  @Get('monitor')
  tablero(@Usuario() u: UsuarioActual) {
    return this.monitor.tablero(alcanceOperador(u), alcanceZona(u));
  }

  // Mapa de la app del conductor: sin login.
  @Publico()
  @Get('mapa')
  mapa() {
    return this.monitor.mapa();
  }
}
