// Catálogo de comandos que el sistema central (CSMS) puede enviar al cargador, por versión de
// OCPP (1.6J y 2.0.1), con una plantilla de ejemplo y la validación de su payload según la
// especificación. La consola OCPP del panel usa este catálogo (GET /ocpp/catalogo?version=).

export type VersionProtocolo = '1.6' | '2.0.1';

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

export const CATALOGO_16: DefinicionComando[] = [
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

// ---------- OCPP 2.0.1 ----------

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const TIPOS_IDTOKEN = ['Central', 'eMAID', 'ISO14443', 'ISO15693', 'KeyCode', 'Local', 'MacAddress', 'NoAuthorization'];
const idTokenValido = (v: unknown) =>
  esObjeto(v) && esTexto(v.idToken, 36) && enumeracion(TIPOS_IDTOKEN)(v.type);
const componenteVariable = (v: unknown) =>
  esObjeto(v) && esObjeto(v.component) && esTexto(v.component.name, 50) && esObjeto(v.variable) && esTexto(v.variable.name, 50);
const evseValido = (v: unknown) => esObjeto(v) && esEntero(v.id) && (v.id as number) >= 0;
const MENSAJES_TRIGGER_201 = [
  'BootNotification',
  'LogStatusNotification',
  'FirmwareStatusNotification',
  'Heartbeat',
  'MeterValues',
  'SignChargingStationCertificate',
  'SignV2GCertificate',
  'StatusNotification',
  'TransactionEvent',
  'SignCombinedCertificate',
  'PublishFirmwareStatusNotification',
];

export const CATALOGO_201: DefinicionComando[] = [
  {
    accion: 'RequestStartTransaction',
    descripcion: 'Inicia una carga remota. idToken.type "Central" para órdenes del sistema central.',
    plantilla: { idToken: { idToken: 'PANEL', type: 'Central' }, remoteStartId: 1, evseId: 1 },
    validar: (p) => [
      ...requerido(p, 'idToken', idTokenValido, 'es obligatorio: { idToken (texto ≤ 36), type (Central, ISO14443…) }'),
      ...requerido(p, 'remoteStartId', esEntero, 'es obligatorio (entero)'),
      ...opcional(p, 'evseId', (v) => esEntero(v) && (v as number) > 0, 'debe ser un entero mayor que 0'),
    ],
  },
  {
    accion: 'RequestStopTransaction',
    descripcion: 'Detiene la transacción indicada (el id lo asigna el cargador, es texto).',
    plantilla: { transactionId: '' },
    validar: (p) => requerido(p, 'transactionId', (v) => esTexto(v, 36), 'es obligatorio (texto de 1 a 36 caracteres)'),
  },
  {
    accion: 'GetTransactionStatus',
    descripcion: 'Pregunta si una transacción sigue en curso y si quedan mensajes pendientes por enviar.',
    plantilla: { transactionId: '' },
    validar: (p) => opcional(p, 'transactionId', (v) => esTexto(v, 36), 'debe ser texto de 1 a 36 caracteres'),
  },
  {
    accion: 'Reset',
    descripcion: 'Reinicia la estación: Immediate (ya) u OnIdle (cuando no haya cargas).',
    plantilla: { type: 'OnIdle' },
    validar: (p) => [
      ...requerido(p, 'type', enumeracion(['Immediate', 'OnIdle']), 'debe ser "Immediate" u "OnIdle"'),
      ...opcional(p, 'evseId', (v) => esEntero(v) && (v as number) > 0, 'debe ser un entero mayor que 0'),
    ],
  },
  {
    accion: 'ChangeAvailability',
    descripcion: 'Habilita (Operative) o deshabilita (Inoperative) la estación o un EVSE.',
    plantilla: { operationalStatus: 'Operative' },
    validar: (p) => [
      ...requerido(p, 'operationalStatus', enumeracion(['Operative', 'Inoperative']), 'debe ser "Operative" o "Inoperative"'),
      ...opcional(p, 'evse', evseValido, 'debe ser { id: entero ≥ 0, connectorId? }'),
    ],
  },
  {
    accion: 'GetVariables',
    descripcion: 'Lee variables de componentes, por ejemplo OCPPCommCtrlr.HeartbeatInterval.',
    plantilla: { getVariableData: [{ component: { name: 'OCPPCommCtrlr' }, variable: { name: 'HeartbeatInterval' } }] },
    validar: (p) =>
      requerido(
        p,
        'getVariableData',
        (v) => Array.isArray(v) && v.length > 0 && v.every(componenteVariable),
        'es obligatorio: lista de { component: { name }, variable: { name } }',
      ),
  },
  {
    accion: 'SetVariables',
    descripcion: 'Cambia variables de componentes, por ejemplo el intervalo de heartbeat.',
    plantilla: {
      setVariableData: [{ attributeValue: '300', component: { name: 'OCPPCommCtrlr' }, variable: { name: 'HeartbeatInterval' } }],
    },
    validar: (p) =>
      requerido(
        p,
        'setVariableData',
        (v) =>
          Array.isArray(v) &&
          v.length > 0 &&
          v.every((x) => componenteVariable(x) && typeof (x as Record<string, unknown>).attributeValue === 'string'),
        'es obligatorio: lista de { attributeValue (texto), component: { name }, variable: { name } }',
      ),
  },
  {
    accion: 'UnlockConnector',
    descripcion: 'Desbloquea la pistola del conector indicado.',
    plantilla: { evseId: 1, connectorId: 1 },
    validar: (p) => [
      ...requerido(p, 'evseId', (v) => esEntero(v) && (v as number) > 0, 'es obligatorio (entero > 0)'),
      ...requerido(p, 'connectorId', (v) => esEntero(v) && (v as number) > 0, 'es obligatorio (entero > 0)'),
    ],
  },
  {
    accion: 'TriggerMessage',
    descripcion: 'Pide a la estación que envíe un mensaje ahora (Heartbeat, StatusNotification…).',
    plantilla: { requestedMessage: 'StatusNotification', evse: { id: 1, connectorId: 1 } },
    validar: (p) => [
      ...requerido(p, 'requestedMessage', enumeracion(MENSAJES_TRIGGER_201), `debe ser uno de: ${MENSAJES_TRIGGER_201.join(', ')}`),
      ...opcional(p, 'evse', evseValido, 'debe ser { id: entero ≥ 0, connectorId? }'),
    ],
  },
  {
    accion: 'ClearCache',
    descripcion: 'Borra la caché de autorizaciones de la estación.',
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
    ],
  },
];

export const CATALOGOS: Record<VersionProtocolo, DefinicionComando[]> = { '1.6': CATALOGO_16, '2.0.1': CATALOGO_201 };

export function validarComando(accion: string, payload: unknown, version: VersionProtocolo = '1.6'): string[] {
  const definicion = CATALOGOS[version].find((c) => c.accion === accion);
  if (!definicion) return [`Acción no soportada en OCPP ${version}: ${accion}`];
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return ['El payload debe ser un objeto JSON'];
  }
  return definicion.validar(payload as Record<string, unknown>);
}
