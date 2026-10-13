import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { alcanceOperador, Publico, Roles, Usuario, UsuarioActual } from '../../comun/decoradores';
import { ClienteProforma, ProformasService } from './proformas.service';

@Controller('proformas')
export class ProformasController {
  constructor(private readonly proformas: ProformasService) {}

  @Get()
  listar(@Usuario() usuario: UsuarioActual, @Query('estado') estado?: string, @Query('q') q?: string) {
    return this.proformas.listar(alcanceOperador(usuario), { estado: estado || undefined, q });
  }

  // Lo abre el QR del documento: sin login, con el código de verificación.
  @Publico()
  @Get('verificar/:codigo')
  verificar(@Param('codigo') codigo: string) {
    return this.proformas.porCodigo(codigo);
  }

  @Get(':id')
  obtener(@Param('id') id: string, @Usuario() usuario: UsuarioActual) {
    return this.proformas.obtener(id, alcanceOperador(usuario));
  }

  @Post()
  generar(
    @Body() body: { sesion_id: string; cliente?: Partial<ClienteProforma>; aplicar_retenciones?: boolean },
    @Usuario() usuario: UsuarioActual,
  ) {
    return this.proformas.generar(body, usuario, alcanceOperador(usuario));
  }

  @Roles('admin')
  @HttpCode(200)
  @Post(':id/anular')
  anular(@Param('id') id: string, @Body() body: { motivo: string }, @Usuario() usuario: UsuarioActual) {
    return this.proformas.anular(id, body.motivo, usuario);
  }
}
