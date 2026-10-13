import { Global, Module } from '@nestjs/common';
import { AlmacenService } from './almacen.service';

@Global()
@Module({
  providers: [AlmacenService],
  exports: [AlmacenService],
})
export class ComunModule {}
