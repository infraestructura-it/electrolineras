import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AlmacenService } from '../../comun/almacen.service';

export interface OperadorRegistro {
  id: string;
  nombre: string;
  nit: string | null; // identifica a la empresa en su licencia de activación
  email_contacto: string | null;
  cuenta_beneficiario: string | null;
  comision_pactada: number | null; // porcentaje: 20 = 20 %
  // Programa de puntos de la empresa: el conductor gana puntos_por_kwh y cada punto vale valor_punto_cop
  // de descuento en las cargas de esta empresa (desde minimo_canje puntos).
  puntos: { activo: boolean; puntos_por_kwh: number; valor_punto_cop: number; minimo_canje: number };
}

export const PUNTOS_POR_DEFECTO = { activo: true, puntos_por_kwh: 1, valor_punto_cop: 50, minimo_canje: 20 };

// Datos persistidos en data/operadores.json (ver AlmacenService).
// TODO: reemplazar por el repositorio TypeORM de Operador al conectar PostgreSQL.
@Injectable()
export class OperadoresService {
  private readonly operadores = new Map<string, OperadorRegistro>();

  constructor(private readonly almacen: AlmacenService) {
    for (const o of this.almacen.leer<OperadorRegistro[]>('operadores', [])) {
      o.nit ??= null;
      o.puntos ??= { ...PUNTOS_POR_DEFECTO };
      this.operadores.set(o.id, o);
    }
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
    nit?: string;
    email_contacto?: string;
    cuenta_beneficiario?: string;
    comision_pactada?: number | null;
  }): OperadorRegistro {
    if (!data.nombre?.trim()) throw new BadRequestException('El nombre del operador es obligatorio');
    const operador: OperadorRegistro = {
      id: randomUUID(),
      nombre: data.nombre.trim(),
      nit: OperadoresService.normalizarNit(data.nit),
      email_contacto: data.email_contacto?.trim() || null,
      cuenta_beneficiario: data.cuenta_beneficiario?.trim() || null,
      comision_pactada: this.validarComision(data.comision_pactada),
      puntos: { ...PUNTOS_POR_DEFECTO },
    };
    this.operadores.set(operador.id, operador);
    this.persistir();
    return operador;
  }

  actualizar(
    id: string,
    cambios: { puntos?: Partial<OperadorRegistro['puntos']>; nombre?: string; nit?: string; email_contacto?: string; cuenta_beneficiario?: string; comision_pactada?: number | null },
    alcance: string | null = null,
  ): OperadorRegistro {
    const operador = this.findOne(id, alcance);
    if (cambios.nombre !== undefined) {
      if (!cambios.nombre.trim()) throw new BadRequestException('El nombre del operador es obligatorio');
      operador.nombre = cambios.nombre.trim();
    }
    if (cambios.nit !== undefined) {
      // El NIT ata la licencia: si la empresa ya tiene una, solo la plataforma lo cambia.
      if (alcance && operador.nit) throw new ForbiddenException('El NIT solo lo cambia el administrador de la plataforma');
      operador.nit = OperadoresService.normalizarNit(cambios.nit);
    }
    if (cambios.puntos !== undefined) operador.puntos = this.validarPuntos({ ...operador.puntos, ...cambios.puntos });
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

  // NIT sin puntos, espacios ni dígito de verificación separado: "900.123.456-7" → "9001234567".
  static normalizarNit(nit: string | null | undefined): string | null {
    const limpio = String(nit ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    return limpio || null;
  }

  private validarPuntos(p: OperadorRegistro['puntos']): OperadorRegistro['puntos'] {
    const n = (v: unknown, min: number, max: number, campo: string) => {
      const x = Number(v);
      if (!Number.isFinite(x) || x < min || x > max) throw new BadRequestException(`${campo} debe estar entre ${min} y ${max}`);
      return x;
    };
    return {
      activo: Boolean(p.activo),
      puntos_por_kwh: n(p.puntos_por_kwh, 0, 1000, 'Puntos por kWh'),
      valor_punto_cop: n(p.valor_punto_cop, 0, 100000, 'El valor del punto'),
      minimo_canje: Math.round(n(p.minimo_canje, 0, 1_000_000, 'El mínimo para canjear')),
    };
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
