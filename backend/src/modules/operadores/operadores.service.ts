import { Injectable } from '@nestjs/common';

// TODO: inyectar el repositorio TypeORM de Operador cuando se conecte la base de datos.
@Injectable()
export class OperadoresService {
  findAll() {
    return [];
  }

  findOne(id: string) {
    return { id };
  }

  create(data: { nombre: string; email_contacto?: string }) {
    return { id: 'pendiente', ...data };
  }
}
