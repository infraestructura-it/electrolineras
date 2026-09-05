import { Module } from '@nestjs/common';
import { OperadoresService } from './operadores.service';
import { OperadoresController } from './operadores.controller';

@Module({
  controllers: [OperadoresController],
  providers: [OperadoresService],
  exports: [OperadoresService],
})
export class OperadoresModule {}
