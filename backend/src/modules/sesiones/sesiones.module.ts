import { Module } from '@nestjs/common';
import { SesionesService } from './sesiones.service';
import { SesionesController } from './sesiones.controller';
import { CargadoresModule } from '../cargadores/cargadores.module';
import { OperadoresModule } from '../operadores/operadores.module';
import { FacturacionModule } from '../facturacion/facturacion.module';
import { OcppGatewayModule } from '../ocpp-gateway/ocpp-gateway.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [CargadoresModule, OperadoresModule, FacturacionModule, OcppGatewayModule, AuthModule],
  controllers: [SesionesController],
  providers: [SesionesService],
  exports: [SesionesService],
})
export class SesionesModule {}
