import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AlmacenService } from '../../comun/almacen.service';

export interface ZonaRegistro {
  id: string;
  nombre: string; // ej. "Bogotá Norte", "Eje Cafetero"
  descripcion: string | null;
  creado: string;
}

// Zonas geográficas que agrupan electrolineras. Las administra la plataforma.
// Datos en data/zonas.json.
@Injectable()
export class ZonasService {
  private readonly zonas = new Map<string, ZonaRegistro>();
  private readonly usos: ((zona_id: string) => string | null)[] = [];

  constructor(private readonly almacen: AlmacenService) {
    for (const z of this.almacen.leer<ZonaRegistro[]>('zonas', [])) this.zonas.set(z.id, z);
  }

  // Otros módulos avisan si una zona está en uso (devuelven el motivo) para no borrarla.
  registrarUso(fn: (zona_id: string) => string | null) {
    this.usos.push(fn);
  }

  listar() {
    return [...this.zonas.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  obtener(id: string) {
    const zona = this.zonas.get(id);
    if (!zona) throw new NotFoundException(`No existe la zona ${id}`);
    return zona;
  }

  // Valida un zona_id opcional que llega de un formulario.
  validarOpcional(id: string | null | undefined): string | null {
    if (id === undefined || id === null || id === '') return null;
    return this.obtener(id).id;
  }

  crear(data: { nombre: string; descripcion?: string }) {
    const nombre = data.nombre?.trim();
    if (!nombre) throw new BadRequestException('El nombre de la zona es obligatorio');
    if (this.listar().some((z) => z.nombre.toLowerCase() === nombre.toLowerCase())) {
      throw new ConflictException(`Ya existe la zona ${nombre}`);
    }
    const zona: ZonaRegistro = { id: randomUUID(), nombre, descripcion: data.descripcion?.trim() || null, creado: new Date().toISOString() };
    this.zonas.set(zona.id, zona);
    this.persistir();
    return zona;
  }

  actualizar(id: string, cambios: { nombre?: string; descripcion?: string }) {
    const zona = this.obtener(id);
    if (cambios.nombre !== undefined) {
      const nombre = cambios.nombre.trim();
      if (!nombre) throw new BadRequestException('El nombre de la zona es obligatorio');
      zona.nombre = nombre;
    }
    if (cambios.descripcion !== undefined) zona.descripcion = cambios.descripcion?.trim() || null;
    this.persistir();
    return zona;
  }

  eliminar(id: string) {
    this.obtener(id);
    for (const uso of this.usos) {
      const motivo = uso(id);
      if (motivo) throw new ConflictException(`No se puede borrar la zona: ${motivo}`);
    }
    this.zonas.delete(id);
    this.persistir();
  }

  private persistir() {
    this.almacen.guardar('zonas', this.listar());
  }
}
