#!/usr/bin/env node
// Simulador de un cargador MDXDC3001 (OCPP 1.6J) para probar el gateway sin el equipo físico.
//
// Uso (desde la carpeta simulador/, después de "npm install"):
//   npm start -- <url> <numero_serie> [--potencia 30] [--intervalo 5]
//   npm start -- ws://192.168.2.47:3000/ocpp/ws 2222233333
// o directamente: node simulador-ocpp.js <url> <numero_serie>
//
// Comandos por teclado mientras corre:
//   t <idTag>   pasar una tarjeta RFID (Authorize + StartTransaction)
//   s           detener la carga desde el cargador (StopTransaction)
//   f           simular una falla (StatusNotification Faulted) · a = volver a Available
//   q           salir
'use strict';

const WebSocket = require('ws');
const { randomUUID } = require('crypto');
const readline = require('readline');

const args = process.argv.slice(2);
const opcion = (nombre, defecto) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 ? Number(args[i + 1]) : defecto;
};
const [urlBase, serie] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!urlBase || !serie) {
  console.error('Uso: npm start -- <url> <numero_serie> [--potencia 30] [--intervalo 5]\n  Ej.: npm start -- ws://192.168.2.47:3000/ocpp/ws 2222233333');
  process.exit(1);
}
const POTENCIA_KW = opcion('potencia', 30);
const INTERVALO_MEDICION_S = opcion('intervalo', 5);

const config = {
  HeartbeatInterval: '300',
  MeterValueSampleInterval: String(INTERVALO_MEDICION_S),
  AuthorizeRemoteTxRequests: 'false',
  NumberOfConnectors: '1',
  ChargePointVendor: 'SSWL',
};

let ws;
let medidorWh = 1_250_000; // lectura acumulada del medidor (Wh)
let transaccion = null; // { id, idTag }
let estado = 'Available';
let disponible = true;
let temporizadorHeartbeat;
let temporizadorMedicion;
const pendientes = new Map();

const log = (...m) => console.log(new Date().toLocaleTimeString('es-CO'), ...m);

function llamar(accion, payload) {
  const id = randomUUID();
  ws.send(JSON.stringify([2, id, accion, payload]));
  log('→', accion, JSON.stringify(payload));
  return new Promise((resolver) => pendientes.set(id, { accion, resolver }));
}

function responder(id, payload) {
  ws.send(JSON.stringify([3, id, payload]));
}

function enviarEstado(nuevo, errorCode = 'NoError') {
  estado = nuevo;
  return llamar('StatusNotification', { connectorId: 1, errorCode, status: nuevo, timestamp: new Date().toISOString() });
}

function programarHeartbeat() {
  clearInterval(temporizadorHeartbeat);
  temporizadorHeartbeat = setInterval(() => llamar('Heartbeat', {}), Number(config.HeartbeatInterval) * 1000);
}

function enviarMedicion() {
  return llamar('MeterValues', {
    connectorId: 1,
    transactionId: transaccion?.id,
    meterValue: [
      {
        timestamp: new Date().toISOString(),
        sampledValue: [
          { measurand: 'Energy.Active.Import.Register', unit: 'Wh', value: String(Math.round(medidorWh)) },
          { measurand: 'Power.Active.Import', unit: 'kW', value: transaccion ? String(POTENCIA_KW) : '0' },
        ],
      },
    ],
  });
}

async function iniciarCarga(idTag) {
  if (transaccion) return log('Ya hay una carga en curso');
  await enviarEstado('Preparing');
  const r = await llamar('StartTransaction', {
    connectorId: 1,
    idTag,
    meterStart: Math.round(medidorWh),
    timestamp: new Date().toISOString(),
  });
  if (r?.idTagInfo?.status !== 'Accepted') {
    log('StartTransaction rechazado:', r?.idTagInfo?.status);
    return enviarEstado('Available');
  }
  transaccion = { id: r.transactionId, idTag };
  await enviarEstado('Charging');
  const whPorMuestra = (POTENCIA_KW * 1000 * INTERVALO_MEDICION_S) / 3600;
  temporizadorMedicion = setInterval(() => {
    medidorWh += whPorMuestra;
    enviarMedicion();
  }, INTERVALO_MEDICION_S * 1000);
  log(`Cargando a ${POTENCIA_KW} kW · transacción ${transaccion.id}`);
}

async function detenerCarga(motivo = 'Remote') {
  if (!transaccion) return log('No hay carga en curso');
  clearInterval(temporizadorMedicion);
  const { id, idTag } = transaccion;
  transaccion = null;
  await enviarEstado('Finishing');
  await llamar('StopTransaction', {
    transactionId: id,
    idTag,
    meterStop: Math.round(medidorWh),
    timestamp: new Date().toISOString(),
    reason: motivo,
  });
  await enviarEstado('Available');
}

// Comandos que llegan del sistema central.
function atender(id, accion, p) {
  log('←', accion, JSON.stringify(p));
  switch (accion) {
    case 'RemoteStartTransaction':
      if (transaccion || !disponible) return responder(id, { status: 'Rejected' });
      responder(id, { status: 'Accepted' });
      return setTimeout(() => iniciarCarga(p.idTag), 1500); // el usuario ya conectó la pistola
    case 'RemoteStopTransaction':
      if (!transaccion || transaccion.id !== p.transactionId) return responder(id, { status: 'Rejected' });
      responder(id, { status: 'Accepted' });
      return setTimeout(() => detenerCarga('Remote'), 1000);
    case 'Reset':
      responder(id, { status: 'Accepted' });
      log(`Reinicio ${p.type}: reconectando en 3 s`);
      return setTimeout(() => ws.close(1012, 'Reset'), 500);
    case 'ChangeAvailability':
      disponible = p.type === 'Operative';
      responder(id, { status: transaccion ? 'Scheduled' : 'Accepted' });
      if (!transaccion) enviarEstado(disponible ? 'Available' : 'Unavailable');
      return;
    case 'GetConfiguration': {
      const claves = p.key?.length ? p.key : Object.keys(config);
      return responder(id, {
        configurationKey: claves.filter((k) => k in config).map((k) => ({ key: k, readonly: false, value: config[k] })),
        unknownKey: claves.filter((k) => !(k in config)),
      });
    }
    case 'ChangeConfiguration':
      if (!(p.key in config)) return responder(id, { status: 'NotSupported' });
      config[p.key] = p.value;
      if (p.key === 'HeartbeatInterval') programarHeartbeat();
      return responder(id, { status: 'Accepted' });
    case 'UnlockConnector':
      return responder(id, { status: 'Unlocked' });
    case 'ClearCache':
      return responder(id, { status: 'Accepted' });
    case 'DataTransfer':
      return responder(id, { status: 'Accepted', data: 'OK' });
    case 'TriggerMessage': {
      const soportados = { Heartbeat: () => llamar('Heartbeat', {}), StatusNotification: () => enviarEstado(estado), MeterValues: enviarMedicion, BootNotification: boot };
      if (!soportados[p.requestedMessage]) return responder(id, { status: 'NotImplemented' });
      responder(id, { status: 'Accepted' });
      return setTimeout(soportados[p.requestedMessage], 300);
    }
    default:
      ws.send(JSON.stringify([4, id, 'NotImplemented', `${accion} no soportado por el simulador`, {}]));
  }
}

async function boot() {
  const r = await llamar('BootNotification', {
    chargePointVendor: 'SSWL',
    chargePointModel: 'MDXDC3001',
    chargePointSerialNumber: serie,
    firmwareVersion: 'SSWL_DC-V1.0.69',
  });
  log('BootNotification:', r?.status, '· hora del servidor', r?.currentTime);
  if (r?.status !== 'Accepted') return log('El servidor rechazó el cargador (¿está registrado en el panel?)');
  config.HeartbeatInterval = String(r.interval ?? 300);
  programarHeartbeat();
  await enviarEstado(disponible ? 'Available' : 'Unavailable');
}

function conectar() {
  const url = `${urlBase.replace(/\/+$/, '')}/${encodeURIComponent(serie)}`;
  log('Conectando a', url);
  ws = new WebSocket(url, ['ocpp1.6']);
  ws.on('open', boot);
  ws.on('message', (texto) => {
    const m = JSON.parse(texto.toString());
    if (m[0] === 2) return atender(m[1], m[2], m[3]);
    const pendiente = pendientes.get(m[1]);
    pendientes.delete(m[1]);
    if (m[0] === 4) log('✗ CALLERROR', pendiente?.accion, m[2], m[3]);
    pendiente?.resolver(m[0] === 3 ? m[2] : null);
  });
  ws.on('close', (codigo) => {
    clearInterval(temporizadorHeartbeat);
    clearInterval(temporizadorMedicion);
    transaccion = null;
    log(`Conexión cerrada (${codigo}). Reintentando en 3 s…`);
    setTimeout(conectar, 3000);
  });
  ws.on('error', (e) => log('Error:', e.message));
}

readline.createInterface({ input: process.stdin }).on('line', (linea) => {
  const [cmd, valor] = linea.trim().split(/\s+/);
  if (cmd === 't') {
    llamar('Authorize', { idTag: valor || 'AF22FF0B' }).then((r) => {
      if (r?.idTagInfo?.status === 'Accepted') iniciarCarga(valor || 'AF22FF0B');
      else log('Tarjeta rechazada:', r?.idTagInfo?.status);
    });
  } else if (cmd === 's') detenerCarga('Local');
  else if (cmd === 'f') enviarEstado('Faulted', 'GroundFailure');
  else if (cmd === 'a') enviarEstado('Available');
  else if (cmd === 'q') process.exit(0);
});

conectar();
