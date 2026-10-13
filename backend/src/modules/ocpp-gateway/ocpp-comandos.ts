// Catálogo de comandos OCPP 1.6J que el sistema central (CSMS) puede enviar al cargador,
// con una plantilla de ejemplo y la validación de su payload según la especificación.
// La consola OCPP del panel usa este catálogo (GET /ocpp/catalogo).

type Validador = (p: Record<string, unknown>) => string[];

export interface DefinicionComando {
  accion: string;
  descripcion: string;
  plantilla: Record<string, unknown>;
  validar: Validador;
}

const esEntero = (v: unknown) => Number.isInteger(v);
const esTexto = (v: unknown, max: number) => typeof v === 'string' && v.length > 0 && v.length <= max;

const requerido = (p: Record<string, unknown>, campo: string, ok: (v: unknown) => boolean, detalle: string) =>
  ok(p[campo]) ? [] : [`"${campo}" ${detalle}`];
const opcional = (p: Record<string, unknown>, campo: string, ok: (v: unknown) => boolean, detalle: string) =>
  p[campo] === undefined ? [] : requerido(p, campo, ok, detalle);
const enumeracion = (valores: string[]) => (v: unknown) => typeof v === 'string' && valores.includes(v);

const MENSAJES_TRIGGER = [
  'BootNotification',
  'DiagnosticsStatusNotification',
  'FirmwareStatusNotification',
  'Heartbeat',
  'MeterValues',
  'StatusNotification',
];

export const CATALOGO_COMANDOS: DefinicionComando[] = [
  {
    accion: 'RemoteStartTransaction',
    descripcion: 'Inicia una carga remota con un idTag (máx. 20 caracteres).',
    plantilla: { connectorId: 1, idTag: 'PANEL' },
    validar: (p) => [
      ...requerido(p, 'idTag', (v) => esTexto(v, 20), 'es obligatorio (texto de 1 a 20 caracteres)'),
      ...opcional(p, 'connectorId', (v) => esEntero(v) && (v as number) > 0, 'debe ser un entero mayor que 0'),
    ],
  },
  {
    accion: 'RemoteStopTransaction',
    descripcion: 'Detiene la transacción indicada.',
    plantilla: { transactionId: 1 },
    validar: (p) => requerido(p, 'transactionId', esEntero, 'es obligatorio (entero)'),
  },
  {
    accion: 'Reset',
    descripcion: 'Reinicia el cargador: Soft (software) o Hard (equipo).',
    plantilla: { type: 'Soft' },
    validar: (p) => requerido(p, 'type', enumeracion(['Soft', 'Hard']), 'debe ser "Soft" o "Hard"'),
  },
  {
    accion: 'ChangeAvailability',
    descripcion: 'Habilita (Operative) o deshabilita (Inoperative) un conector; 0 = todo el cargador.',
    plantilla: { connectorId: 0, type: 'Operative' },
    validar: (p) => [
      ...requerido(p, 'connectorId', (v) => esEntero(v) && (v as number) >= 0, 'es obligatorio (entero ≥ 0)'),
      ...requerido(p, 'type', enumeracion(['Operative', 'Inoperative']), 'debe ser "Operative" o "Inoperative"'),
    ],
  },
  {
    accion: 'GetConfiguration',
    descripcion: 'Lee la configuración del cargador. Sin "key" devuelve todas las claves.',
    plantilla: { key: [] },
    validar: (p) =>
      opcional(
        p,
        'key',
        (v) => Array.isArray(v) && v.every((k) => esTexto(k, 50)),
        'debe ser una lista de textos (máx. 50 caracteres cada uno)',
      ),
  },
  {
    accion: 'ChangeConfiguration',
    descripcion: 'Cambia una clave de configuración, por ejemplo HeartbeatInterval.',
    plantilla: { key: 'HeartbeatInterval', value: '300' },
    validar: (p) => [
      ...requerido(p, 'key', (v) => esTexto(v, 50), 'es obligatorio (texto de 1 a 50 caracteres)'),
      ...requerido(p, 'value', (v) => typeof v === 'string' && v.length <= 500, 'es obligatorio (texto, máx. 500)'),
    ],
  },
  {
    accion: 'UnlockConnector',
    descripcion: 'Desbloquea la pistola del conector indicado.',
    plantilla: { connectorId: 1 },
    validar: (p) => requerido(p, 'connectorId', (v) => esEntero(v) && (v as number) > 0, 'es obligatorio (entero > 0)'),
  },
  {
    accion: 'TriggerMessage',
    descripcion: 'Pide al cargador que envíe un mensaje ahora (Heartbeat, StatusNotification…).',
    plantilla: { requestedMessage: 'StatusNotification', connectorId: 1 },
    validar: (p) => [
      ...requerido(p, 'requestedMessage', enumeracion(MENSAJES_TRIGGER), `debe ser uno de: ${MENSAJES_TRIGGER.join(', ')}`),
      ...opcional(p, 'connectorId', (v) => esEntero(v) && (v as number) >= 0, 'debe ser un entero ≥ 0'),
    ],
  },
  {
    accion: 'ClearCache',
    descripcion: 'Borra la caché de autorizaciones (tarjetas) del cargador.',
    plantilla: {},
    validar: () => [],
  },
  {
    accion: 'DataTransfer',
    descripcion: 'Mensaje propietario del fabricante (vendorId obligatorio).',
    plantilla: { vendorId: 'SSWL', messageId: '', data: '' },
    validar: (p) => [
      ...requerido(p, 'vendorId', (v) => esTexto(v, 255), 'es obligatorio (texto de 1 a 255 caracteres)'),
      ...opcional(p, 'messageId', (v) => typeof v === 'string' && v.length <= 50, 'debe ser texto (máx. 50)'),
      ...opcional(p, 'data', (v) => typeof v === 'string', 'debe ser texto'),
    ],
  },
];

export function validarComando(accion: string, payload: unknown): string[] {
  const definicion = CATALOGO_COMANDOS.find((c) => c.accion === accion);
  if (!definicion) return [`Acción no soportada: ${accion}`];
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return ['El payload debe ser un objeto JSON'];
  }
  return definicion.validar(payload as Record<string, unknown>);
}
