import { Injectable } from '@nestjs/common';

// TODO: inyectar el repositorio TypeORM de Cargador cuando se conecte la base de datos.
@Injectable()
export class CargadoresService {
  findAll() {
    return [];
  }

  findByNumeroSerie(numero_serie: string) {
    return { numero_serie };
  }

  registrar(data: { numero_serie: string; modelo: string; operador_id: string }) {
    return { id: 'pendiente', estado: 'inactivo', ...data };
  }
}
