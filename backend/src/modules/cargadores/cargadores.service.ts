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
import { ElectrolineasService } from '../electrolineras/electrolineras.service';

export type EstadoCargador = 'activo' | 'inactivo' | 'en_falla';
// Versión OCPP del cargador. 'auto' acepta la que el equipo ofrezca al conectarse (prefiere la más nueva).
export type VersionOcpp = 'auto' | '1.6' | '2.0.1';
export const VERSIONES_OCPP: VersionOcpp[] = ['auto', '1.6', '2.0.1'];

export interface CargadorRegistro {
  id: string;
  numero_serie: string; // pile_number_master configurado en el cargador (Basic Settings)
  modelo: string;
  ubicacion: string | null; // punto dentro de la electrolinera, ej. "Bahía 2"
  estado: EstadoCargador;
  tarifa_por_kwh: number | null; // COP por kWh
  operador_id: string;
  electrolinera_id: string | null;
  version_ocpp: VersionOcpp;
  potencia_kw: number; // potencia nominal (MDXDC3001: 30 kW)
  creado: string;
}

type DatosCargador = {
  numero_serie?: string;
  modelo?: string;
  operador_id?: string;
  ubicacion?: string;
  tarifa_por_kwh?: number | null;
  electrolinera_id?: string | null;
  version_ocpp?: VersionOcpp;
  potencia_kw?: number;
  estado?: EstadoCargador;
};

const ESTADOS: EstadoCargador[] = ['activo', 'inactivo', 'en_falla'];
const SERIE_VALIDA = /^[A-Za-z0-9._-]{1,48}$/; // va en la URL OCPP y en la del QR

// Datos persistidos en data/cargadores.json (ver AlmacenService).
// TODO: reemplazar por el repositorio TypeORM de Cargador al conectar PostgreSQL.
@Injectable()
export class CargadoresService {
  private readonly cargadores = new Map<string, CargadorRegistro>(); // clave: numero_serie
  private validadoresAlta: ((operador_id: string) => void)[] = [];

  constructor(
    private readonly almacen: AlmacenService,
    private readonly operadoresService: OperadoresService,
    private readonly electrolineras: ElectrolineasService,
  ) {
    for (const c of this.almacen.leer<CargadorRegistro[]>('cargadores', [])) {
      // Campos agregados después: valores por defecto para los cargadores ya registrados.
      c.electrolinera_id ??= null;
      c.version_ocpp ??= 'auto';
      c.potencia_kw ??= 30;
      this.cargadores.set(c.numero_serie, c);
    }
    this.electrolineras.registrarUso((id) => {
      const n = [...this.cargadores.values()].filter((c) => c.electrolinera_id === id).length;
      return n ? `tiene ${n} cargador(es); muévelos o bórralos primero` : null;
    });
  }

  // alcance: null = todos (admin); un operador_id = solo los de esa empresa.
  // zona: solo los cargadores de electrolineras de esa zona (operario con zona).
  findAll(alcance: string | null = null, zona: string | null = null): CargadorRegistro[] {
    return [...this.cargadores.values()].filter(
      (c) =>
        (!alcance || c.operador_id === alcance) &&
        (!zona || this.electrolineras.buscar(c.electrolinera_id)?.zona_id === zona),
    );
  }

  // Reglas externas para registrar un cargador (licencias): lanzan una excepción si no se puede.
  registrarValidadorAlta(fn: (operador_id: string) => void) {
    this.validadoresAlta.push(fn);
  }

  // Números de serie visibles para un alcance (null = sin restricción).
  seriesVisibles(alcance: string | null, zona: string | null): Set<string> | null {
    if (!alcance && !zona) return null;
    return new Set(this.findAll(alcance, zona).map((c) => c.numero_serie));
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
    const e = this.electrolineras.buscar(c.electrolinera_id);
    return {
      id: c.id,
      numero_serie: c.numero_serie,
      modelo: c.modelo,
      ubicacion: c.ubicacion,
      estado: c.estado,
      tarifa_por_kwh: c.tarifa_por_kwh,
      potencia_kw: c.potencia_kw,
      operador_id: c.operador_id,
      operador_nombre: operador.nombre,
      electrolinera: e
        ? { id: e.id, nombre: e.nombre, direccion: e.direccion, ciudad: e.ciudad, latitud: e.latitud, longitud: e.longitud, horario: e.horario }
        : null,
    };
  }

  registrar(data: DatosCargador, alcance: string | null = null): CargadorRegistro {
    const numero_serie = data.numero_serie?.trim();
    if (!numero_serie || !SERIE_VALIDA.test(numero_serie)) {
      throw new BadRequestException('El número de serie solo admite letras, números, punto, guion y guion bajo (máx. 48)');
    }
    if (this.cargadores.has(numero_serie)) {
      throw new ConflictException(`El cargador ${numero_serie} ya está registrado`);
    }
    // Un operador solo registra cargadores a su nombre.
    const electrolinera = data.electrolinera_id ? this.electrolineras.obtener(data.electrolinera_id, alcance) : null;
    const operador_id = alcance ?? electrolinera?.operador_id ?? data.operador_id;
    if (!operador_id) throw new BadRequestException('Elige la empresa dueña del cargador');
    this.operadoresService.findOne(operador_id);
    if (electrolinera && electrolinera.operador_id !== operador_id) {
      throw new BadRequestException('La electrolinera pertenece a otra empresa');
    }
    for (const validar of this.validadoresAlta) validar(operador_id);

    const cargador: CargadorRegistro = {
      id: randomUUID(),
      numero_serie,
      modelo: data.modelo?.trim() || 'MDXDC3001',
      ubicacion: data.ubicacion?.trim() || null,
      // Disponible de entrada; si se conecta por OCPP, StatusNotification lo mantiene al día.
      estado: 'activo',
      tarifa_por_kwh: this.validarTarifa(data.tarifa_por_kwh),
      operador_id,
      electrolinera_id: electrolinera?.id ?? null,
      version_ocpp: this.validarVersion(data.version_ocpp ?? 'auto'),
      potencia_kw: this.validarPotencia(data.potencia_kw ?? 30),
      creado: new Date().toISOString(),
    };
    this.cargadores.set(numero_serie, cargador);
    this.persistir();
    return cargador;
  }

  actualizar(numero_serie: string, cambios: DatosCargador, alcance: string | null = null): CargadorRegistro {
    const cargador = this.findByNumeroSerie(numero_serie, alcance);
    if (cambios.electrolinera_id !== undefined) {
      const e = cambios.electrolinera_id ? this.electrolineras.obtener(cambios.electrolinera_id, alcance) : null;
      if (e && e.operador_id !== cargador.operador_id) throw new BadRequestException('La electrolinera pertenece a otra empresa');
      cargador.electrolinera_id = e?.id ?? null;
    }
    if (cambios.version_ocpp !== undefined) cargador.version_ocpp = this.validarVersion(cambios.version_ocpp);
    if (cambios.potencia_kw !== undefined) cargador.potencia_kw = this.validarPotencia(cambios.potencia_kw);
    if (cambios.modelo !== undefined && cambios.modelo?.trim()) cargador.modelo = cambios.modelo.trim();
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

  private validarVersion(v: unknown): VersionOcpp {
    if (!VERSIONES_OCPP.includes(v as VersionOcpp)) throw new BadRequestException('Versión OCPP inválida (auto, 1.6 o 2.0.1)');
    return v as VersionOcpp;
  }

  private validarPotencia(v: unknown): number {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0 || n > 1000) throw new BadRequestException('La potencia nominal debe estar entre 0 y 1000 kW');
    return n;
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
