import { Module } from '@nestjs/common';
import { SesionesService } from './sesiones.service';
import { SesionesController } from './sesiones.controller';

@Module({
  controllers: [SesionesController],
  providers: [SesionesService],
  exports: [SesionesService],
})
export class SesionesModule {}
