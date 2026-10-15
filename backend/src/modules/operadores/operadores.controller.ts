import { Controller, Get, Post, Patch, Param, Body } from '@nestjs/common';
import { alcanceOperador, GESTION, Roles, Usuario, UsuarioActual } from '../../comun/decoradores';
import { OperadoresService } from './operadores.service';

@Controller('operadores')
export class OperadoresController {
  constructor(private readonly operadoresService: OperadoresService) {}

  @Get()
  findAll(@Usuario() usuario: UsuarioActual) {
    return this.operadoresService.findAll(alcanceOperador(usuario));
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Usuario() usuario: UsuarioActual) {
    return this.operadoresService.findOne(id, alcanceOperador(usuario));
  }

  @Roles('admin')
  @Post()
  create(
    @Body()
    body: {
      nombre: string;
      nit?: string;
      email_contacto?: string;
      cuenta_beneficiario?: string;
      comision_pactada?: number | null;
    },
  ) {
    return this.operadoresService.create(body);
  }

  @Roles(...GESTION)
  @Patch(':id')
  actualizar(
    @Param('id') id: string,
    @Body()
    body: { nombre?: string; nit?: string; email_contacto?: string; cuenta_beneficiario?: string; comision_pactada?: number | null },
    @Usuario() usuario: UsuarioActual,
  ) {
    return this.operadoresService.actualizar(id, body, alcanceOperador(usuario));
  }
}
