import { Module } from '@nestjs/common';
import { CargadoresModule } from '../cargadores/cargadores.module';
import { OcppGatewayModule } from '../ocpp-gateway/ocpp-gateway.module';
import { OperadoresModule } from '../operadores/operadores.module';
import { SesionesModule } from '../sesiones/sesiones.module';
import { ZonasModule } from '../zonas/zonas.module';
import { MonitorController } from './monitor.controller';
import { MonitorService } from './monitor.service';

@Module({
  imports: [CargadoresModule, OcppGatewayModule, OperadoresModule, SesionesModule, ZonasModule],
  controllers: [MonitorController],
  providers: [MonitorService],
})
export class MonitorModule {}
