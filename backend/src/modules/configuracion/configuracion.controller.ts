import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Publico, Roles } from '../../comun/decoradores';
import { Configuracion, ConfiguracionService } from './configuracion.service';

@Controller('configuracion')
export class ConfiguracionController {
  constructor(private readonly configuracion: ConfiguracionService) {}

  @Publico()
  @Get('publica')
  publica() {
    return this.configuracion.publica();
  }

  @Roles('admin')
  @Get()
  obtener() {
    return this.configuracion.obtener();
  }

  @Roles('admin')
  @Patch()
  actualizar(@Body() body: Partial<Configuracion>) {
    return this.configuracion.actualizar(body);
  }
}
