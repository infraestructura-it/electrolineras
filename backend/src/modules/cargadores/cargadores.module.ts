import { Module } from '@nestjs/common';
import { CargadoresService } from './cargadores.service';
import { CargadoresController } from './cargadores.controller';
import { OperadoresModule } from '../operadores/operadores.module';

@Module({
  imports: [OperadoresModule],
  controllers: [CargadoresController],
  providers: [CargadoresService],
  exports: [CargadoresService],
})
export class CargadoresModule {}
