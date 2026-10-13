import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';

export interface OperadorRegistro {
  id: string;
  nombre: string;
  email_contacto: string | null;
  cuenta_beneficiario: string | null;
  comision_pactada: number | null; // porcentaje: 20 = 20 %
}

// Almacenamiento en memoria: los datos se pierden al reiniciar el backend.
// TODO: reemplazar el Map por el repositorio TypeORM de Operador al conectar PostgreSQL.
@Injectable()
export class OperadoresService {
  private readonly operadores = new Map<string, OperadorRegistro>();

  findAll(): OperadorRegistro[] {
    return [...this.operadores.values()];
  }

  findOne(id: string): OperadorRegistro {
    const operador = this.operadores.get(id);
    if (!operador) throw new NotFoundException(`No existe el operador ${id}`);
    return operador;
  }

  create(data: {
    nombre: string;
    email_contacto?: string;
    cuenta_beneficiario?: string;
    comision_pactada?: number | null;
  }): OperadorRegistro {
    const operador: OperadorRegistro = {
      id: randomUUID(),
      nombre: data.nombre,
      email_contacto: data.email_contacto ?? null,
      cuenta_beneficiario: data.cuenta_beneficiario ?? null,
      comision_pactada: data.comision_pactada ?? null,
    };
    this.operadores.set(operador.id, operador);
    return operador;
  }
}
