import { CATALOGO_16, CATALOGO_201, validarComando } from '../../src/modules/ocpp-gateway/ocpp-comandos';

describe('Catálogo de comandos OCPP', () => {
  it.each([
    ['1.6', CATALOGO_16],
    ['2.0.1', CATALOGO_201],
  ] as const)('la plantilla de cada comando %s pasa su propia validación', (version, catalogo) => {
    for (const c of catalogo) {
      expect({ accion: c.accion, errores: validarComando(c.accion, c.plantilla, version) }).toEqual({ accion: c.accion, errores: [] });
    }
  });

  it('las acciones no se repiten dentro de una versión', () => {
    for (const catalogo of [CATALOGO_16, CATALOGO_201]) {
      const acciones = catalogo.map((c) => c.accion);
      expect(new Set(acciones).size).toBe(acciones.length);
    }
  });

  it('incluye inicio y fin remotos en cada versión', () => {
    expect(CATALOGO_16.map((c) => c.accion)).toEqual(expect.arrayContaining(['RemoteStartTransaction', 'RemoteStopTransaction']));
    expect(CATALOGO_201.map((c) => c.accion)).toEqual(expect.arrayContaining(['RequestStartTransaction', 'RequestStopTransaction']));
  });
});

describe('validarComando (1.6)', () => {
  it('rechaza acciones que no existen en la versión', () => {
    expect(validarComando('Inventado', {})).toEqual(['Acción no soportada en OCPP 1.6: Inventado']);
    expect(validarComando('RequestStartTransaction', {}, '1.6')[0]).toMatch(/no soportada/);
  });

  it('exige que el payload sea un objeto', () => {
    expect(validarComando('Reset', null)).toEqual(['El payload debe ser un objeto JSON']);
    expect(validarComando('Reset', [])).toEqual(['El payload debe ser un objeto JSON']);
    expect(validarComando('Reset', 'Soft')).toEqual(['El payload debe ser un objeto JSON']);
  });

  it('RemoteStartTransaction: idTag de 1 a 20 caracteres y connectorId entero > 0', () => {
    expect(validarComando('RemoteStartTransaction', { idTag: 'ABC' })).toEqual([]);
    expect(validarComando('RemoteStartTransaction', { idTag: 'X'.repeat(21) })).toHaveLength(1);
    expect(validarComando('RemoteStartTransaction', {})).toHaveLength(1);
    expect(validarComando('RemoteStartTransaction', { idTag: 'A', connectorId: 0 })).toHaveLength(1);
    expect(validarComando('RemoteStartTransaction', { idTag: 'A', connectorId: 1.5 })).toHaveLength(1);
  });

  it('RemoteStopTransaction exige transactionId entero', () => {
    expect(validarComando('RemoteStopTransaction', { transactionId: 7 })).toEqual([]);
    expect(validarComando('RemoteStopTransaction', { transactionId: '7' })).toHaveLength(1);
  });

  it('Reset solo acepta Soft o Hard', () => {
    expect(validarComando('Reset', { type: 'Hard' })).toEqual([]);
    expect(validarComando('Reset', { type: 'Apagar' })).toHaveLength(1);
  });
});
