import { Module } from '@nestjs/common';
import { CargadoresModule } from '../cargadores/cargadores.module';
import { OperadoresModule } from '../operadores/operadores.module';
import { SesionesModule } from '../sesiones/sesiones.module';
import { ProformasController } from './proformas.controller';
import { ProformasService } from './proformas.service';

@Module({
  imports: [SesionesModule, CargadoresModule, OperadoresModule],
  controllers: [ProformasController],
  providers: [ProformasService],
})
export class ProformasModule {}
