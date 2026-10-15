import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AlmacenService } from '../../comun/almacen.service';
import { OperadoresService } from '../operadores/operadores.service';
import { ZonasService } from '../zonas/zonas.service';

// Una electrolinera es el sitio físico (estación) donde están uno o varios cargadores.
export interface ElectrolineraRegistro {
  id: string;
  nombre: string;
  operador_id: string; // empresa dueña
  zona_id: string | null;
  direccion: string | null;
  ciudad: string | null;
  latitud: number | null;
  longitud: number | null;
  horario: string | null; // texto libre: "24 horas", "L-V 6:00-22:00"
  descripcion: string | null;
  creado: string;
}

type DatosElectrolinera = Partial<Omit<ElectrolineraRegistro, 'id' | 'creado'>>;

// Datos en data/electrolineras.json.
@Injectable()
export class ElectrolineasService {
  private readonly electrolineras = new Map<string, ElectrolineraRegistro>();
  private readonly usos: ((electrolinera_id: string) => string | null)[] = [];

  constructor(
    private readonly almacen: AlmacenService,
    private readonly operadores: OperadoresService,
    private readonly zonas: ZonasService,
  ) {
    for (const e of this.almacen.leer<ElectrolineraRegistro[]>('electrolineras', [])) this.electrolineras.set(e.id, e);
    this.zonas.registrarUso((zona_id) => {
      const n = [...this.electrolineras.values()].filter((e) => e.zona_id === zona_id).length;
      return n ? `tiene ${n} electrolinera(s) asignada(s)` : null;
    });
  }

  registrarUso(fn: (electrolinera_id: string) => string | null) {
    this.usos.push(fn);
  }

  // alcance = empresa (null = todas); zona = limita a esa zona (operario con zona).
  listar(alcance: string | null = null, zona: string | null = null) {
    return [...this.electrolineras.values()]
      .filter((e) => (!alcance || e.operador_id === alcance) && (!zona || e.zona_id === zona))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  obtener(id: string, alcance: string | null = null) {
    const e = this.electrolineras.get(id);
    if (!e) throw new NotFoundException(`No existe la electrolinera ${id}`);
    if (alcance && e.operador_id !== alcance) throw new ForbiddenException('No tienes acceso a esta electrolinera');
    return e;
  }

  buscar(id: string | null | undefined) {
    return id ? this.electrolineras.get(id) ?? null : null;
  }

  crear(data: DatosElectrolinera, alcance: string | null = null) {
    const operador_id = alcance ?? data.operador_id;
    if (!operador_id) throw new BadRequestException('Elige la empresa dueña de la electrolinera');
    this.operadores.findOne(operador_id);
    const e: ElectrolineraRegistro = {
      id: randomUUID(),
      nombre: '',
      operador_id,
      zona_id: null,
      direccion: null,
      ciudad: null,
      latitud: null,
      longitud: null,
      horario: null,
      descripcion: null,
      creado: new Date().toISOString(),
    };
    this.aplicar(e, data);
    if (!e.nombre) throw new BadRequestException('El nombre de la electrolinera es obligatorio');
    this.electrolineras.set(e.id, e);
    this.persistir();
    return e;
  }

  actualizar(id: string, cambios: DatosElectrolinera, alcance: string | null = null) {
    const e = this.obtener(id, alcance);
    this.aplicar(e, { ...cambios, operador_id: undefined }); // la empresa no cambia
    this.persistir();
    return e;
  }

  eliminar(id: string, alcance: string | null = null) {
    this.obtener(id, alcance);
    for (const uso of this.usos) {
      const motivo = uso(id);
      if (motivo) throw new ConflictException(`No se puede borrar la electrolinera: ${motivo}`);
    }
    this.electrolineras.delete(id);
    this.persistir();
  }

  private aplicar(e: ElectrolineraRegistro, d: DatosElectrolinera) {
    const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    if (d.nombre !== undefined) e.nombre = texto(d.nombre) ?? '';
    if (d.zona_id !== undefined) e.zona_id = this.zonas.validarOpcional(d.zona_id);
    if (d.direccion !== undefined) e.direccion = texto(d.direccion);
    if (d.ciudad !== undefined) e.ciudad = texto(d.ciudad);
    if (d.horario !== undefined) e.horario = texto(d.horario);
    if (d.descripcion !== undefined) e.descripcion = texto(d.descripcion);
    if (d.latitud !== undefined || d.longitud !== undefined) {
      const lat = d.latitud === undefined ? e.latitud : this.coordenada(d.latitud, 90, 'latitud');
      const lng = d.longitud === undefined ? e.longitud : this.coordenada(d.longitud, 180, 'longitud');
      if ((lat === null) !== (lng === null)) throw new BadRequestException('Indica latitud y longitud juntas (o ninguna)');
      e.latitud = lat;
      e.longitud = lng;
    }
  }

  private coordenada(v: unknown, limite: number, nombre: string): number | null {
    if (v === null || v === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n) || Math.abs(n) > limite) throw new BadRequestException(`La ${nombre} no es válida`);
    return Number(n.toFixed(6));
  }

  private persistir() {
    this.almacen.guardar('electrolineras', [...this.electrolineras.values()]);
  }
}
