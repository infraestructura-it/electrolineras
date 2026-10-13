import { Module } from '@nestjs/common';
import { CargadoresModule } from '../cargadores/cargadores.module';
import { OcppGatewayService } from './ocpp-gateway.service';
import { OcppGatewayController } from './ocpp-gateway.controller';

@Module({
  imports: [CargadoresModule],
  controllers: [OcppGatewayController],
  providers: [OcppGatewayService],
  exports: [OcppGatewayService],
})
export class OcppGatewayModule {}
