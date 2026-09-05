import { Module } from '@nestjs/common';
import { OcppGatewayService } from './ocpp-gateway.service';

@Module({
  providers: [OcppGatewayService],
  exports: [OcppGatewayService],
})
export class OcppGatewayModule {}
