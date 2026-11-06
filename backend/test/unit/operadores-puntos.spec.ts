import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AlmacenService } from '../../src/comun/almacen.service';
import { OperadoresService } from '../../src/modules/operadores/operadores.service';
import { PuntosService } from '../../src/modules/conductores/puntos.service';
import { SesionesService, SesionRegistro } from '../../src/modules/sesiones/sesiones.service';

// Almacén en memoria: sin archivos.
const almacenEnMemoria = () => {
  const datos = new Map<string, unknown>();
  return {
    leer: <T>(c: string, d: T) => (datos.has(c) ? (datos.get(c) as T) : d),
    guardar: (c: string, v: unknown) => void datos.set(c, JSON.parse(JSON.stringify(v))),
  } as unknown as AlmacenService;
};

describe('OperadoresService', () => {
  let operadores: OperadoresService;
  beforeEach(() => (operadores = new OperadoresService(almacenEnMemoria())));

  it('normaliza el NIT (sin puntos, espacios ni guion)', () => {
    expect(OperadoresService.normalizarNit('900.123.456-7')).toBe('9001234567');
    expect(OperadoresService.normalizarNit(' 800 555 ')).toBe('800555');
    expect(OperadoresService.normalizarNit('')).toBeNull();
    expect(OperadoresService.normalizarNit(null)).toBeNull();
  });

  it('crea la empresa con el programa de puntos por defecto', () => {
    const op = operadores.create({ nombre: '  EV Norte  ', nit: '900.1-2' });
    expect(op).toMatchObject({ nombre: 'EV Norte', nit: '90012', comision_pactada: null });
    expect(op.puntos).toEqual({ activo: true, puntos_por_kwh: 1, valor_punto_cop: 50, minimo_canje: 20 });
  });

  it('valida nombre y comisión', () => {
    expect(() => operadores.create({ nombre: ' ' })).toThrow(BadRequestException);
    expect(() => operadores.create({ nombre: 'A', comision_pactada: 101 })).toThrow(BadRequestException);
    expect(() => operadores.create({ nombre: 'A', comision_pactada: -1 })).toThrow(BadRequestException);
    expect(operadores.create({ nombre: 'A', comision_pactada: 0 }).comision_pactada).toBe(0);
  });

  it('solo el admin (sin alcance) cambia la comisión pactada', () => {
    const op = operadores.create({ nombre: 'A' });
    expect(() => operadores.actualizar(op.id, { comision_pactada: 5 }, op.id)).toThrow(ForbiddenException);
    expect(operadores.actualizar(op.id, { comision_pactada: 5 }).comision_pactada).toBe(5);
  });

  it('un administrador de empresa no ve ni edita otra empresa', () => {
    const a = operadores.create({ nombre: 'A' });
    const b = operadores.create({ nombre: 'B' });
    expect(() => operadores.findOne(b.id, a.id)).toThrow(ForbiddenException);
    expect(operadores.findAll(a.id).map((o) => o.id)).toEqual([a.id]);
  });

  it('valida los rangos del programa de puntos', () => {
    const op = operadores.create({ nombre: 'A' });
    expect(() => operadores.actualizar(op.id, { puntos: { valor_punto_cop: -1 } })).toThrow(BadRequestException);
    expect(operadores.actualizar(op.id, { puntos: { minimo_canje: 10.6 } }).puntos.minimo_canje).toBe(11);
  });
});

describe('PuntosService', () => {
  let operadores: OperadoresService;
  let puntos: PuntosService;
  let empresa: string;
  const sesionesFalsas = { registrarPrograma: jest.fn() } as unknown as SesionesService;

  const sesion = (cambios: Partial<SesionRegistro> = {}): SesionRegistro =>
    ({
      id: `s-${Math.random()}`,
      operador_id: empresa,
      conductor_id: 'c1',
      numero_serie: 'MDX1',
      kwh_consumidos: 25.9,
      costo_total: 11900,
      descuento_puntos: null,
      ...cambios,
    }) as SesionRegistro;

  beforeEach(() => {
    operadores = new OperadoresService(almacenEnMemoria());
    empresa = operadores.create({ nombre: 'EV' }).id;
    puntos = new PuntosService(almacenEnMemoria(), operadores, sesionesFalsas);
  });

  it('acumula floor(kWh × puntos_por_kwh) una sola vez por sesión', () => {
    const s = sesion();
    expect(puntos.acumular(s)).toBe(25);
    expect(puntos.acumular(s)).toBe(0); // idempotente
    expect(puntos.saldo('c1', empresa)).toBe(25);
  });

  it('no acumula sin conductor ni con el programa apagado', () => {
    expect(puntos.acumular(sesion({ conductor_id: null }))).toBe(0);
    operadores.actualizar(empresa, { puntos: { activo: false } });
    expect(puntos.acumular(sesion())).toBe(0);
  });

  it('no redime por debajo del mínimo de canje', () => {
    puntos.acumular(sesion({ kwh_consumidos: 19 }));
    expect(puntos.descuento(sesion())).toBeNull();
  });

  it('redime los puntos necesarios sin pasar del costo de la carga', () => {
    puntos.acumular(sesion({ kwh_consumidos: 100 })); // 100 pts = $5.000
    const d = puntos.descuento(sesion({ costo_total: 1234 })); // floor(1234/50) = 24 pts
    expect(d).toEqual({ puntos: 24, valor: 1200 });
    expect(puntos.saldo('c1', empresa)).toBe(76);
  });

  it('los puntos son por empresa: no se redimen en otra', () => {
    puntos.acumular(sesion({ kwh_consumidos: 100 }));
    const otra = operadores.create({ nombre: 'Otra' }).id;
    expect(puntos.descuento(sesion({ operador_id: otra }))).toBeNull();
  });

  it('el reverso devuelve los puntos de una redención que no se cobró', () => {
    puntos.acumular(sesion({ kwh_consumidos: 50 }));
    const s = sesion();
    s.descuento_puntos = puntos.descuento(s);
    expect(puntos.saldo('c1', empresa)).toBe(0);
    puntos.revertirDescuento(s);
    expect(puntos.saldo('c1', empresa)).toBe(50);
    expect(puntos.resumen('c1').ahorro_cop).toBe(0);
  });
});
