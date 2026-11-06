import { valorEnLetras } from '../../src/modules/proformas/valor-en-letras';

describe('valorEnLetras', () => {
  it.each([
    [0, 'CERO PESOS M/CTE'],
    [1, 'UN PESO M/CTE'],
    [15, 'QUINCE PESOS M/CTE'],
    [21, 'VEINTIÚN PESOS M/CTE'],
    [45, 'CUARENTA Y CINCO PESOS M/CTE'],
    [100, 'CIEN PESOS M/CTE'],
    [101, 'CIENTO UN PESOS M/CTE'],
    [1000, 'MIL PESOS M/CTE'],
    [1001, 'MIL UN PESOS M/CTE'],
    [21000, 'VEINTIÚN MIL PESOS M/CTE'],
    [100000, 'CIEN MIL PESOS M/CTE'],
    [282895, 'DOSCIENTOS OCHENTA Y DOS MIL OCHOCIENTOS NOVENTA Y CINCO PESOS M/CTE'],
    [1_000_000, 'UN MILLÓN DE PESOS M/CTE'],
    [2_000_000, 'DOS MILLONES DE PESOS M/CTE'],
    [1_500_000, 'UN MILLÓN QUINIENTOS MIL PESOS M/CTE'],
    [21_000_000, 'VEINTIÚN MILLONES DE PESOS M/CTE'],
  ])('%i → %s', (valor, esperado) => {
    expect(valorEnLetras(valor)).toBe(esperado);
  });

  it('redondea a pesos', () => {
    expect(valorEnLetras(99.6)).toBe('CIEN PESOS M/CTE');
    expect(valorEnLetras(11900.4)).toBe('ONCE MIL NOVECIENTOS PESOS M/CTE');
  });

  it('devuelve vacío para valores negativos o no numéricos', () => {
    expect(valorEnLetras(-5)).toBe('');
    expect(valorEnLetras(Number.NaN)).toBe('');
  });
});
