import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AlmacenService } from '../../comun/almacen.service';

export interface OperadorRegistro {
  id: string;
  nombre: string;
  email_contacto: string | null;
  cuenta_beneficiario: string | null;
  comision_pactada: number | null; // porcentaje: 20 = 20 %
}

// Datos persistidos en data/operadores.json (ver AlmacenService).
// TODO: reemplazar por el repositorio TypeORM de Operador al conectar PostgreSQL.
@Injectable()
export class OperadoresService {
  private readonly operadores = new Map<string, OperadorRegistro>();

  constructor(private readonly almacen: AlmacenService) {
    for (const o of this.almacen.leer<OperadorRegistro[]>('operadores', [])) this.operadores.set(o.id, o);
  }

  // alcance: null = todos (admin); un id = solo ese operador.
  findAll(alcance: string | null = null): OperadorRegistro[] {
    const todos = [...this.operadores.values()];
    return alcance ? todos.filter((o) => o.id === alcance) : todos;
  }

  findOne(id: string, alcance: string | null = null): OperadorRegistro {
    const operador = this.operadores.get(id);
    if (!operador) throw new NotFoundException(`No existe el operador ${id}`);
    if (alcance && alcance !== id) throw new ForbiddenException('No tienes acceso a este operador');
    return operador;
  }

  create(data: {
    nombre: string;
    email_contacto?: string;
    cuenta_beneficiario?: string;
    comision_pactada?: number | null;
  }): OperadorRegistro {
    if (!data.nombre?.trim()) throw new BadRequestException('El nombre del operador es obligatorio');
    const operador: OperadorRegistro = {
      id: randomUUID(),
      nombre: data.nombre.trim(),
      email_contacto: data.email_contacto?.trim() || null,
      cuenta_beneficiario: data.cuenta_beneficiario?.trim() || null,
      comision_pactada: this.validarComision(data.comision_pactada),
    };
    this.operadores.set(operador.id, operador);
    this.persistir();
    return operador;
  }

  actualizar(
    id: string,
    cambios: { nombre?: string; email_contacto?: string; cuenta_beneficiario?: string; comision_pactada?: number | null },
    alcance: string | null = null,
  ): OperadorRegistro {
    const operador = this.findOne(id, alcance);
    if (cambios.nombre !== undefined) {
      if (!cambios.nombre.trim()) throw new BadRequestException('El nombre del operador es obligatorio');
      operador.nombre = cambios.nombre.trim();
    }
    if (cambios.email_contacto !== undefined) operador.email_contacto = cambios.email_contacto.trim() || null;
    if (cambios.cuenta_beneficiario !== undefined) operador.cuenta_beneficiario = cambios.cuenta_beneficiario.trim() || null;
    // La comisión la negocia la plataforma: solo un admin la cambia (alcance null).
    if (cambios.comision_pactada !== undefined) {
      if (alcance) throw new ForbiddenException('Solo el administrador puede cambiar la comisión pactada');
      operador.comision_pactada = this.validarComision(cambios.comision_pactada);
    }
    this.persistir();
    return operador;
  }

  eliminar(id: string) {
    this.operadores.delete(id);
    this.persistir();
  }

  private validarComision(valor: number | null | undefined): number | null {
    if (valor === undefined || valor === null || (valor as unknown) === '') return null;
    const n = Number(valor);
    if (!Number.isFinite(n) || n < 0 || n > 100) throw new BadRequestException('La comisión debe estar entre 0 y 100 %');
    return n;
  }

  private persistir() {
    this.almacen.guardar('operadores', [...this.operadores.values()]);
  }
}
