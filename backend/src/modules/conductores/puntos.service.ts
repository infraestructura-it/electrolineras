import { Injectable, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AlmacenService } from '../../comun/almacen.service';
import { OperadoresService } from '../operadores/operadores.service';
import { ProgramaIncentivos, SesionesService, SesionRegistro } from '../sesiones/sesiones.service';

// Movimiento del libro de puntos. El saldo es la suma de movimientos (acumulación +,
// redención -, reverso + de una redención que no se cobró).
export interface MovimientoPuntos {
  id: string;
  conductor_id: string;
  operador_id: string;
  tipo: 'acumulacion' | 'redencion' | 'reverso';
  puntos: number; // con signo
  valor_cop: number; // descuento equivalente (solo redención/reverso)
  sesion_id: string | null;
  fecha: string;
  detalle: string;
}

// Programa de puntos: cada empresa define cuántos puntos da por kWh y cuánto vale un punto.
// Los puntos se acumulan por empresa y solo se redimen en cargadores de la misma empresa,
// porque es ella quien asume el descuento.
@Injectable()
export class PuntosService implements ProgramaIncentivos, OnModuleInit {
  private movimientos: MovimientoPuntos[];

  constructor(
    private readonly almacen: AlmacenService,
    private readonly operadores: OperadoresService,
    private readonly sesiones: SesionesService,
  ) {
    this.movimientos = this.almacen.leer<MovimientoPuntos[]>('puntos', []);
  }

  onModuleInit() {
    this.sesiones.registrarPrograma(this);
  }

  saldo(conductor_id: string, operador_id: string) {
    return this.movimientos
      .filter((m) => m.conductor_id === conductor_id && m.operador_id === operador_id)
      .reduce((t, m) => t + m.puntos, 0);
  }

  // Resumen para la app: saldo por empresa con su valor en pesos, movimientos y ahorro.
  resumen(conductor_id: string) {
    const propios = this.movimientos.filter((m) => m.conductor_id === conductor_id);
    const ids = [...new Set(propios.map((m) => m.operador_id))];
    const empresas = ids.map((id) => {
      const op = this.empresa(id);
      const saldo = this.saldo(conductor_id, id);
      return {
        operador_id: id,
        operador_nombre: op?.nombre ?? 'Empresa',
        saldo,
        valor_cop: op ? saldo * op.puntos.valor_punto_cop : 0,
        minimo_canje: op?.puntos.minimo_canje ?? 0,
        programa_activo: !!op?.puntos.activo,
      };
    });
    const ahorro = propios.reduce((t, m) => t + (m.tipo === 'redencion' ? m.valor_cop : m.tipo === 'reverso' ? -m.valor_cop : 0), 0);
    const ganados = propios.filter((m) => m.tipo === 'acumulacion').reduce((t, m) => t + m.puntos, 0);
    return {
      saldo_total: empresas.reduce((t, e) => t + e.saldo, 0),
      valor_total_cop: empresas.reduce((t, e) => t + e.valor_cop, 0),
      puntos_ganados: ganados,
      ahorro_cop: ahorro,
      empresas,
      movimientos: [...propios].sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha)).slice(0, 100)
        .map((m) => ({ ...m, operador_nombre: this.empresa(m.operador_id)?.nombre ?? 'Empresa' })),
    };
  }

  // Programa de la empresa dueña de un cargador y lo que el conductor tiene allí.
  programaDe(operador_id: string, conductor_id: string | null) {
    const op = this.empresa(operador_id);
    const p = op?.puntos;
    const saldo = conductor_id ? this.saldo(conductor_id, operador_id) : 0;
    return {
      activo: !!p?.activo,
      puntos_por_kwh: p?.puntos_por_kwh ?? 0,
      valor_punto_cop: p?.valor_punto_cop ?? 0,
      minimo_canje: p?.minimo_canje ?? 0,
      saldo,
      saldo_cop: saldo * (p?.valor_punto_cop ?? 0),
      puede_redimir: !!p?.activo && saldo > 0 && saldo >= (p?.minimo_canje ?? 0),
    };
  }

  // ---------- ProgramaIncentivos (lo llama SesionesService al pagar) ----------

  descuento(sesion: SesionRegistro) {
    const op = this.empresa(sesion.operador_id);
    if (!sesion.conductor_id || !op?.puntos.activo || !sesion.costo_total) return null;
    const { valor_punto_cop, minimo_canje } = op.puntos;
    const saldo = this.saldo(sesion.conductor_id, sesion.operador_id);
    if (saldo <= 0 || saldo < minimo_canje || valor_punto_cop <= 0) return null;
    // No se descuenta más que el costo de la carga: se usan solo los puntos necesarios.
    const puntos = Math.min(saldo, Math.floor(sesion.costo_total / valor_punto_cop));
    if (puntos <= 0) return null;
    const valor = puntos * valor_punto_cop;
    this.registrar({
      conductor_id: sesion.conductor_id, operador_id: sesion.operador_id, tipo: 'redencion',
      puntos: -puntos, valor_cop: valor, sesion_id: sesion.id, detalle: `Descuento en la carga de ${sesion.numero_serie}`,
    });
    return { puntos, valor };
  }

  revertirDescuento(sesion: SesionRegistro) {
    if (!sesion.conductor_id || !sesion.descuento_puntos) return;
    this.registrar({
      conductor_id: sesion.conductor_id, operador_id: sesion.operador_id, tipo: 'reverso',
      puntos: sesion.descuento_puntos.puntos, valor_cop: sesion.descuento_puntos.valor, sesion_id: sesion.id,
      detalle: 'Devolución: el pago no se completó',
    });
  }

  acumular(sesion: SesionRegistro) {
    const op = this.empresa(sesion.operador_id);
    if (!sesion.conductor_id || !op?.puntos.activo) return 0;
    if (this.movimientos.some((m) => m.sesion_id === sesion.id && m.tipo === 'acumulacion')) return 0;
    const puntos = Math.floor(sesion.kwh_consumidos * op.puntos.puntos_por_kwh);
    if (puntos <= 0) return 0;
    this.registrar({
      conductor_id: sesion.conductor_id, operador_id: sesion.operador_id, tipo: 'acumulacion',
      puntos, valor_cop: 0, sesion_id: sesion.id, detalle: `${sesion.kwh_consumidos.toFixed(2).replace('.', ',')} kWh en ${sesion.numero_serie}`,
    });
    return puntos;
  }

  private registrar(m: Omit<MovimientoPuntos, 'id' | 'fecha'>) {
    this.movimientos.push({ ...m, id: randomUUID(), fecha: new Date().toISOString() });
    this.almacen.guardar('puntos', this.movimientos);
  }

  private empresa(id: string) {
    try {
      return this.operadores.findOne(id);
    } catch {
      return null;
    }
  }
}
