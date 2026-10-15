import { Module } from '@nestjs/common';
import { ComunModule } from './comun/comun.module';
import { ConfiguracionModule } from './modules/configuracion/configuracion.module';
import { AuthModule } from './modules/auth/auth.module';
import { OperadoresModule } from './modules/operadores/operadores.module';
import { CargadoresModule } from './modules/cargadores/cargadores.module';
import { SesionesModule } from './modules/sesiones/sesiones.module';
import { FacturacionModule } from './modules/facturacion/facturacion.module';
import { OcppGatewayModule } from './modules/ocpp-gateway/ocpp-gateway.module';
import { ProformasModule } from './modules/proformas/proformas.module';
import { ZonasModule } from './modules/zonas/zonas.module';
import { MonitorModule } from './modules/monitor/monitor.module';

@Module({
  imports: [
    ComunModule,
    ConfiguracionModule,
    AuthModule,
    OperadoresModule,
    CargadoresModule,
    SesionesModule,
    FacturacionModule,
    OcppGatewayModule,
    ProformasModule,
    ZonasModule,
    MonitorModule,
  ],
})
export class AppModule {}
