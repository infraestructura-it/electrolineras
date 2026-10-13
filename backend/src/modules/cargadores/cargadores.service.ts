import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { OperadoresService } from '../operadores/operadores.service';

export type EstadoCargador = 'activo' | 'inactivo' | 'en_falla';

export interface CargadorRegistro {
  id: string;
  numero_serie: string; // pile_number configurado en el cargador (Basic Settings)
  modelo: string;
  ubicacion: string | null;
  estado: EstadoCargador;
  tarifa_por_kwh: number | null; // COP por kWh
  operador_id: string;
}

const ESTADOS: EstadoCargador[] = ['activo', 'inactivo', 'en_falla'];

// Almacenamiento en memoria: los datos se pierden al reiniciar el backend.
// TODO: reemplazar el Map por el repositorio TypeORM de Cargador al conectar PostgreSQL.
// TODO: cuando el gateway OCPP esté conectado, el estado lo debe actualizar StatusNotification.
@Injectable()
export class CargadoresService {
  private readonly cargadores = new Map<string, CargadorRegistro>(); // clave: numero_serie

  constructor(private readonly operadoresService: OperadoresService) {}

  findAll(): CargadorRegistro[] {
    return [...this.cargadores.values()];
  }

  findByNumeroSerie(numero_serie: string): CargadorRegistro {
    const cargador = this.cargadores.get(numero_serie);
    if (!cargador) throw new NotFoundException(`No existe el cargador ${numero_serie}`);
    return cargador;
  }

  findById(id: string): CargadorRegistro {
    const cargador = this.findAll().find((c) => c.id === id);
    if (!cargador) throw new NotFoundException(`No existe el cargador ${id}`);
    return cargador;
  }

  // Vista pública para la app de usuario: incluye el nombre del operador.
  detallePublico(numero_serie: string) {
    const cargador = this.findByNumeroSerie(numero_serie);
    const operador = this.operadoresService.findOne(cargador.operador_id);
    return { ...cargador, operador_nombre: operador.nombre };
  }

  registrar(data: {
    numero_serie: string;
    modelo: string;
    operador_id: string;
    ubicacion?: string;
    tarifa_por_kwh?: number | null;
  }): CargadorRegistro {
    const numero_serie = data.numero_serie?.trim();
    if (!numero_serie) throw new BadRequestException('El número de serie es obligatorio');
    if (this.cargadores.has(numero_serie)) {
      throw new ConflictException(`El cargador ${numero_serie} ya está registrado`);
    }
    this.operadoresService.findOne(data.operador_id); // valida que el operador exista

    const cargador: CargadorRegistro = {
      id: randomUUID(),
      numero_serie,
      modelo: data.modelo,
      ubicacion: data.ubicacion ?? null,
      // Sin gateway OCPP todavía, un cargador registrado queda disponible para cargar.
      estado: 'activo',
      tarifa_por_kwh: this.validarTarifa(data.tarifa_por_kwh),
      operador_id: data.operador_id,
    };
    this.cargadores.set(numero_serie, cargador);
    return cargador;
  }

  actualizar(
    numero_serie: string,
    cambios: { ubicacion?: string; tarifa_por_kwh?: number | null; estado?: EstadoCargador },
  ): CargadorRegistro {
    const cargador = this.findByNumeroSerie(numero_serie);
    if (cambios.ubicacion !== undefined) cargador.ubicacion = cambios.ubicacion || null;
    if (cambios.tarifa_por_kwh !== undefined) cargador.tarifa_por_kwh = this.validarTarifa(cambios.tarifa_por_kwh);
    if (cambios.estado !== undefined) {
      if (!ESTADOS.includes(cambios.estado)) throw new BadRequestException(`Estado inválido: ${cambios.estado}`);
      cargador.estado = cambios.estado;
    }
    return cargador;
  }

  private validarTarifa(tarifa: number | null | undefined): number | null {
    if (tarifa === undefined || tarifa === null) return null;
    const valor = Number(tarifa);
    if (!Number.isFinite(valor) || valor <= 0) throw new BadRequestException('La tarifa por kWh debe ser mayor que 0');
    return valor;
  }
}
