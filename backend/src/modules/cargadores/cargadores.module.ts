import { Module } from '@nestjs/common';
import { CargadoresService } from './cargadores.service';
import { CargadoresController } from './cargadores.controller';
import { OperadoresModule } from '../operadores/operadores.module';
import { ZonasModule } from '../zonas/zonas.module';
import { ElectrolineasService } from '../electrolineras/electrolineras.service';
import { ElectrolineasController } from '../electrolineras/electrolineras.controller';

// Electrolineras y cargadores van en el mismo módulo: un cargador pertenece a una electrolinera
// y una electrolinera no se borra mientras tenga cargadores.
@Module({
  imports: [OperadoresModule, ZonasModule],
  controllers: [CargadoresController, ElectrolineasController],
  providers: [ElectrolineasService, CargadoresService],
  exports: [CargadoresService, ElectrolineasService],
})
export class CargadoresModule {}
