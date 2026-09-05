import { Module } from '@nestjs/common';
import { OperadoresModule } from './modules/operadores/operadores.module';
import { CargadoresModule } from './modules/cargadores/cargadores.module';
import { SesionesModule } from './modules/sesiones/sesiones.module';
import { FacturacionModule } from './modules/facturacion/facturacion.module';
import { OcppGatewayModule } from './modules/ocpp-gateway/ocpp-gateway.module';

@Module({
  imports: [
    OperadoresModule,
    CargadoresModule,
    SesionesModule,
    FacturacionModule,
    OcppGatewayModule,
  ],
})
export class AppModule {}
