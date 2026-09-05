import { Module } from '@nestjs/common';
import { CargadoresService } from './cargadores.service';
import { CargadoresController } from './cargadores.controller';

@Module({
  controllers: [CargadoresController],
  providers: [CargadoresService],
  exports: [CargadoresService],
})
export class CargadoresModule {}
