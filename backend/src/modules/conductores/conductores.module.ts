import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CargadoresModule } from '../cargadores/cargadores.module';
import { OperadoresModule } from '../operadores/operadores.module';
import { SesionesModule } from '../sesiones/sesiones.module';
import { ConductoresController } from './conductores.controller';
import { ConductoresService } from './conductores.service';
import { PuntosService } from './puntos.service';

@Module({
  imports: [AuthModule, CargadoresModule, OperadoresModule, SesionesModule],
  controllers: [ConductoresController],
  providers: [ConductoresService, PuntosService],
})
export class ConductoresModule {}
