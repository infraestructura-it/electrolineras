import { Injectable, Logger } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

// Persistencia mínima en archivos JSON (una colección por archivo) para que los datos
// sobrevivan a los reinicios del backend mientras se conecta PostgreSQL.
// Carpeta: DATA_DIR o backend/data (ignorada por git).
// TODO: reemplazar por repositorios TypeORM; los servicios solo usan leer() y guardar().
@Injectable()
export class AlmacenService {
  private readonly logger = new Logger(AlmacenService.name);
  private readonly carpeta = resolve(process.env.DATA_DIR || join(__dirname, '..', '..', 'data'));

  constructor() {
    if (!existsSync(this.carpeta)) mkdirSync(this.carpeta, { recursive: true });
    this.logger.log(`Datos en ${this.carpeta}`);
  }

  leer<T>(coleccion: string, porDefecto: T): T {
    const archivo = this.ruta(coleccion);
    if (!existsSync(archivo)) return porDefecto;
    try {
      return JSON.parse(readFileSync(archivo, 'utf8')) as T;
    } catch (e) {
      this.logger.error(`No se pudo leer ${archivo}: ${(e as Error).message}. Se usa el valor por defecto.`);
      return porDefecto;
    }
  }

  // Escritura atómica: primero a un temporal y luego rename, para no dejar archivos a medias.
  guardar(coleccion: string, datos: unknown) {
    const archivo = this.ruta(coleccion);
    const temporal = `${archivo}.tmp`;
    writeFileSync(temporal, JSON.stringify(datos, null, 2), 'utf8');
    renameSync(temporal, archivo);
  }

  private ruta(coleccion: string) {
    return join(this.carpeta, `${coleccion}.json`);
  }
}
