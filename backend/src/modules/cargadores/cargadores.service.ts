import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AlmacenService } from '../../comun/almacen.service';
import { OperadoresService } from '../operadores/operadores.service';

export type EstadoCargador = 'activo' | 'inactivo' | 'en_falla';

export interface CargadorRegistro {
  id: string;
  numero_serie: string; // pile_number_master configurado en el cargador (Basic Settings)
  modelo: string;
  ubicacion: string | null;
  estado: EstadoCargador;
  tarifa_por_kwh: number | null; // COP por kWh
  operador_id: string;
  creado: string;
}

const ESTADOS: EstadoCargador[] = ['activo', 'inactivo', 'en_falla'];
const SERIE_VALIDA = /^[A-Za-z0-9._-]{1,48}$/; // va en la URL OCPP y en la del QR

// Datos persistidos en data/cargadores.json (ver AlmacenService).
// TODO: reemplazar por el repositorio TypeORM de Cargador al conectar PostgreSQL.
@Injectable()
export class CargadoresService {
  private readonly cargadores = new Map<string, CargadorRegistro>(); // clave: numero_serie

  constructor(
    private readonly almacen: AlmacenService,
    private readonly operadoresService: OperadoresService,
  ) {
    for (const c of this.almacen.leer<CargadorRegistro[]>('cargadores', [])) this.cargadores.set(c.numero_serie, c);
  }

  // alcance: null = todos (admin); un operador_id = solo los de ese operador.
  findAll(alcance: string | null = null): CargadorRegistro[] {
    const todos = [...this.cargadores.values()];
    return alcance ? todos.filter((c) => c.operador_id === alcance) : todos;
  }

  existe(numero_serie: string) {
    return this.cargadores.has(numero_serie);
  }

  findByNumeroSerie(numero_serie: string, alcance: string | null = null): CargadorRegistro {
    const cargador = this.cargadores.get(numero_serie);
    if (!cargador) throw new NotFoundException(`No existe el cargador ${numero_serie}`);
    if (alcance && cargador.operador_id !== alcance) throw new ForbiddenException('No tienes acceso a este cargador');
    return cargador;
  }

  findById(id: string): CargadorRegistro {
    const cargador = this.findAll().find((c) => c.id === id);
    if (!cargador) throw new NotFoundException(`No existe el cargador ${id}`);
    return cargador;
  }

  // Vista pública para la app de usuario: sin datos internos del operador.
  detallePublico(numero_serie: string) {
    const c = this.findByNumeroSerie(numero_serie);
    const operador = this.operadoresService.findOne(c.operador_id);
    return {
      id: c.id,
      numero_serie: c.numero_serie,
      modelo: c.modelo,
      ubicacion: c.ubicacion,
      estado: c.estado,
      tarifa_por_kwh: c.tarifa_por_kwh,
      operador_id: c.operador_id,
      operador_nombre: operador.nombre,
    };
  }

  registrar(
    data: {
      numero_serie: string;
      modelo: string;
      operador_id: string;
      ubicacion?: string;
      tarifa_por_kwh?: number | null;
    },
    alcance: string | null = null,
  ): CargadorRegistro {
    const numero_serie = data.numero_serie?.trim();
    if (!numero_serie || !SERIE_VALIDA.test(numero_serie)) {
      throw new BadRequestException('El número de serie solo admite letras, números, punto, guion y guion bajo (máx. 48)');
    }
    if (this.cargadores.has(numero_serie)) {
      throw new ConflictException(`El cargador ${numero_serie} ya está registrado`);
    }
    // Un operador solo registra cargadores a su nombre.
    const operador_id = alcance ?? data.operador_id;
    this.operadoresService.findOne(operador_id);

    const cargador: CargadorRegistro = {
      id: randomUUID(),
      numero_serie,
      modelo: data.modelo?.trim() || 'MDXDC3001',
      ubicacion: data.ubicacion?.trim() || null,
      // Disponible de entrada; si se conecta por OCPP, StatusNotification lo mantiene al día.
      estado: 'activo',
      tarifa_por_kwh: this.validarTarifa(data.tarifa_por_kwh),
      operador_id,
      creado: new Date().toISOString(),
    };
    this.cargadores.set(numero_serie, cargador);
    this.persistir();
    return cargador;
  }

  actualizar(
    numero_serie: string,
    cambios: { ubicacion?: string; tarifa_por_kwh?: number | null; estado?: EstadoCargador },
    alcance: string | null = null,
  ): CargadorRegistro {
    const cargador = this.findByNumeroSerie(numero_serie, alcance);
    if (cambios.ubicacion !== undefined) cargador.ubicacion = cambios.ubicacion?.trim() || null;
    if (cambios.tarifa_por_kwh !== undefined) cargador.tarifa_por_kwh = this.validarTarifa(cambios.tarifa_por_kwh);
    if (cambios.estado !== undefined) {
      if (!ESTADOS.includes(cambios.estado)) throw new BadRequestException(`Estado inválido: ${cambios.estado}`);
      cargador.estado = cambios.estado;
    }
    this.persistir();
    return cargador;
  }

  // Lo usa el gateway OCPP al recibir StatusNotification.
  actualizarEstadoDesdeOcpp(numero_serie: string, estado: EstadoCargador) {
    const cargador = this.cargadores.get(numero_serie);
    if (!cargador || cargador.estado === estado) return;
    cargador.estado = estado;
    this.persistir();
  }

  eliminar(numero_serie: string, alcance: string | null = null) {
    this.findByNumeroSerie(numero_serie, alcance);
    this.cargadores.delete(numero_serie);
    this.persistir();
  }

  private validarTarifa(tarifa: number | null | undefined): number | null {
    if (tarifa === undefined || tarifa === null || (tarifa as unknown) === '') return null;
    const valor = Number(tarifa);
    if (!Number.isFinite(valor) || valor <= 0) throw new BadRequestException('La tarifa por kWh debe ser mayor que 0');
    return valor;
  }

  private persistir() {
    this.almacen.guardar('cargadores', [...this.cargadores.values()]);
  }
}
