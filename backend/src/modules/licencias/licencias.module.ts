import { Module } from '@nestjs/common';
import { CargadoresModule } from '../cargadores/cargadores.module';
import { OcppGatewayModule } from '../ocpp-gateway/ocpp-gateway.module';
import { OperadoresModule } from '../operadores/operadores.module';
import { SesionesModule } from '../sesiones/sesiones.module';
import { LicenciasController } from './licencias.controller';
import { LicenciasService } from './licencias.service';

@Module({
  imports: [CargadoresModule, OcppGatewayModule, OperadoresModule, SesionesModule],
  controllers: [LicenciasController],
  providers: [LicenciasService],
})
export class LicenciasModule {}
