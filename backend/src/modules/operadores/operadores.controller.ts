import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { OperadoresService } from './operadores.service';

@Controller('operadores')
export class OperadoresController {
  constructor(private readonly operadoresService: OperadoresService) {}

  @Get()
  findAll() {
    return this.operadoresService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.operadoresService.findOne(id);
  }

  @Post()
  create(@Body() body: { nombre: string; email_contacto?: string }) {
    return this.operadoresService.create(body);
  }
}
