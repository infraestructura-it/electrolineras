import { FacturacionService } from '../../src/modules/facturacion/facturacion.service';
import { ConfiguracionService } from '../../src/modules/configuracion/configuracion.service';

const configuracion = (comision_por_defecto: number) =>
  ({ obtener: () => ({ comision_por_defecto }) }) as unknown as ConfiguracionService;

describe('FacturacionService', () => {
  const servicio = new FacturacionService(configuracion(20));

  describe('calcularCosto', () => {
    it('multiplica kWh por la tarifa y redondea a 2 decimales', () => {
      expect(servicio.calcularCosto(10, 1190)).toBe(11900);
      expect(servicio.calcularCosto(1.234, 1000)).toBe(1234);
      expect(servicio.calcularCosto(0.3333, 1)).toBe(0.33);
      expect(servicio.calcularCosto(0, 1190)).toBe(0);
    });
  });

  describe('calcularReparto', () => {
    it('usa la comisión pactada del operador (porcentaje)', () => {
      expect(servicio.calcularReparto(11900, 15)).toEqual({
        comision_plataforma: 1785,
        monto_operador: 10115,
        porcentaje_comision: 15,
      });
    });

    it('usa la comisión por defecto de Configuración si el operador no tiene una pactada', () => {
      const r = servicio.calcularReparto(10000, null);
      expect(r).toEqual({ comision_plataforma: 2000, monto_operador: 8000, porcentaje_comision: 20 });
    });

    it('respeta una comisión pactada de 0 % (no la confunde con "sin valor")', () => {
      expect(servicio.calcularReparto(5000, 0)).toEqual({ comision_plataforma: 0, monto_operador: 5000, porcentaje_comision: 0 });
    });

    it('comisión + pago al operador siempre suman el total', () => {
      for (const [monto, pct] of [[12345.67, 17.5], [999.99, 33.3], [1, 20], [7777, 12.25]]) {
        const r = servicio.calcularReparto(monto, pct);
        expect(Number((r.comision_plataforma + r.monto_operador).toFixed(2))).toBe(monto);
      }
    });
  });

  it('cobrarYDispersar deja el pago pendiente mientras no haya pasarela', async () => {
    const r = await servicio.cobrarYDispersar({ monto_total: 10000, comision_pactada: 10, cuenta_beneficiario: null });
    expect(r).toMatchObject({ estado_pago: 'pendiente', comision_plataforma: 1000, monto_operador: 9000, referencia_pasarela: null });
  });
});
