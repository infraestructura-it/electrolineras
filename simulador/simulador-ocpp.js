#!/usr/bin/env node
// Simulador de un cargador MDXDC3001 para probar la plataforma sin el equipo físico.
// Habla OCPP 1.6J (por defecto) u OCPP 2.0.1 (--ocpp 2.0.1), y simula la batería del vehículo:
// el SoC sube con la carga y al llegar al 100 % el vehículo termina la carga solo.
//
// Uso (desde la carpeta simulador/, después de "npm install", o desde la raíz del repo):
//   npm start -- <url> <numero_serie> [--ocpp 1.6|2.0.1] [--potencia 30] [--intervalo 5]
//                                     [--bateria 60] [--soc 20]
//   npm start -- ws://192.168.2.47:3000/ocpp/ws 2222233333
//   npm start -- ws://192.168.2.47:3000/ocpp/ws 2222233333 --ocpp 2.0.1
//
// Comandos por teclado mientras corre:
//   t <idTag>   pasar una tarjeta RFID (Authorize + inicio de transacción)
//   s           detener la carga desde el cargador
//   f           simular una falla (Faulted) · a = volver a disponible
//   c [seg]     cortar la red N segundos (def. 30): la carga sigue y el cierre se envía al volver
//   x           reinicio que PIERDE la transacción (firmware defectuoso): prueba la recuperación del servidor
//   q           salir
'use strict';

const WebSocket = require('ws');
const { randomUUID, randomBytes } = require('crypto');
const readline = require('readline');

const args = process.argv.slice(2);
const valorDe = (nombre) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const opcion = (nombre, defecto) => (valorDe(nombre) === undefined ? defecto : Number(valorDe(nombre)));
const [urlBase, serie] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!urlBase || !serie) {
  console.error(
    'Uso: npm start -- <url> <numero_serie> [--ocpp 1.6|2.0.1] [--potencia 30] [--intervalo 5] [--bateria 60] [--soc 20]\n' +
      '  Ej.: npm start -- ws://192.168.2.47:3000/ocpp/ws 2222233333',
  );
  process.exit(1);
}
const VERSION = valorDe('ocpp') === '2.0.1' ? '2.0.1' : '1.6';
const V2 = VERSION === '2.0.1';
const POTENCIA_KW = opcion('potencia', 30);
const INTERVALO_MEDICION_S = opcion('intervalo', 5);
const BATERIA_KWH = opcion('bateria', 60); // capacidad del vehículo simulado
const SOC_INICIAL = opcion('soc', 20); // % con el que llega el vehículo

// Configuración que se lee y cambia por OCPP (1.6: claves; 2.0.1: componente.variable).
const config = {
  HeartbeatInterval: '300',
  MeterValueSampleInterval: String(INTERVALO_MEDICION_S),
  AuthorizeRemoteTxRequests: 'false',
  NumberOfConnectors: '1',
  ChargePointVendor: 'SSWL',
};
const VARIABLES_201 = {
  'OCPPCommCtrlr.HeartbeatInterval': 'HeartbeatInterval',
  'SampledDataCtrlr.TxUpdatedInterval': 'MeterValueSampleInterval',
  'AuthCtrlr.AuthorizeRemoteStart': 'AuthorizeRemoteTxRequests',
};

let ws;
let medidorWh = 1_250_000; // lectura acumulada del medidor (Wh)
let transaccion = null; // { id, idTag, soc, seqNo }
let estado = 'Available'; // vocabulario 1.6 (Available, Preparing, Charging, Finishing, Faulted, Unavailable)
let disponible = true;
let temporizadorHeartbeat;
let temporizadorMedicion;
const pendientes = new Map();
// Mensajes de transacción que no se pueden perder: si no hay conexión se guardan y se envían
// en orden al reconectar, como exige OCPP a un cargador real.
const cola = [];
let sinRedHasta = 0;

const log = (...m) => console.log(new Date().toLocaleTimeString('es-CO'), ...m);
const ahora = () => new Date().toISOString();
const enLinea = () => ws && ws.readyState === WebSocket.OPEN;

// Mensajes que se guardan si no hay red (en 2.0.1, el inicio y el fin de la transacción).
const esTransaccional = (accion, payload) =>
  V2 ? accion === 'TransactionEvent' && payload.eventType !== 'Updated' : ['StartTransaction', 'StopTransaction'].includes(accion);

function llamar(accion, payload) {
  if (!enLinea()) {
    if (!esTransaccional(accion, payload)) return Promise.resolve(null);
    log('⏸ Sin conexión: se guarda', accion, payload.eventType ?? '', 'para enviarlo al reconectar');
    return new Promise((resolver) => cola.push({ accion, payload, resolver }));
  }
  const id = randomUUID();
  ws.send(JSON.stringify([2, id, accion, payload]));
  log('→', accion, JSON.stringify(payload));
  return new Promise((resolver) => pendientes.set(id, { accion, resolver }));
}

function responder(id, payload) {
  ws.send(JSON.stringify([3, id, payload]));
}

// ---------- Mensajes según la versión ----------

const STATUS_201 = { Available: 'Available', Preparing: 'Occupied', Charging: 'Occupied', Finishing: 'Occupied', Faulted: 'Faulted', Unavailable: 'Unavailable' };

function enviarEstado(nuevo, errorCode = 'NoError') {
  estado = nuevo;
  if (V2) {
    return llamar('StatusNotification', { timestamp: ahora(), connectorStatus: STATUS_201[nuevo] ?? 'Available', evseId: 1, connectorId: 1 });
  }
  return llamar('StatusNotification', { connectorId: 1, errorCode, status: nuevo, timestamp: ahora() });
}

function muestras(incluirPotencia = true) {
  const energia = V2
    ? { value: Math.round(medidorWh), measurand: 'Energy.Active.Import.Register', unitOfMeasure: { unit: 'Wh' } }
    : { measurand: 'Energy.Active.Import.Register', unit: 'Wh', value: String(Math.round(medidorWh)) };
  const lista = [energia];
  if (incluirPotencia) {
    const kw = transaccion && transaccion.soc < 100 ? POTENCIA_KW : 0;
    lista.push(V2 ? { value: kw, measurand: 'Power.Active.Import', unitOfMeasure: { unit: 'kW' } } : { measurand: 'Power.Active.Import', unit: 'kW', value: String(kw) });
  }
  if (transaccion) {
    const soc = Math.round(transaccion.soc);
    lista.push(V2 ? { value: soc, measurand: 'SoC', unitOfMeasure: { unit: 'Percent' } } : { measurand: 'SoC', unit: 'Percent', value: String(soc) });
  }
  return [{ timestamp: ahora(), sampledValue: lista }];
}

function eventoTransaccion(eventType, triggerReason, extra = {}) {
  transaccion.seqNo = (transaccion.seqNo ?? -1) + 1;
  return llamar('TransactionEvent', {
    eventType,
    timestamp: ahora(),
    triggerReason,
    seqNo: transaccion.seqNo,
    transactionInfo: { transactionId: transaccion.id, ...(extra.info ?? {}) },
    evse: { id: 1, connectorId: 1 },
    ...(extra.idToken ? { idToken: { idToken: extra.idToken, type: extra.tipoToken ?? 'ISO14443' } } : {}),
    meterValue: muestras(eventType !== 'Ended'),
  });
}

function programarHeartbeat() {
  clearInterval(temporizadorHeartbeat);
  temporizadorHeartbeat = setInterval(() => llamar('Heartbeat', {}), Number(config.HeartbeatInterval) * 1000);
}

function enviarMedicion() {
  if (!enLinea()) return null; // el medidor sigue sumando; la lectura sale cuando vuelva la red
  if (V2) {
    if (transaccion) return eventoTransaccion('Updated', 'MeterValuePeriodic', { info: { chargingState: transaccion.soc >= 100 ? 'SuspendedEV' : 'Charging' } });
    return llamar('MeterValues', { evseId: 1, meterValue: muestras() });
  }
  return llamar('MeterValues', { connectorId: 1, transactionId: transaccion?.id, meterValue: muestras() });
}

async function autorizar(idTag) {
  const r = V2 ? await llamar('Authorize', { idToken: { idToken: idTag, type: 'ISO14443' } }) : await llamar('Authorize', { idTag });
  return (V2 ? r?.idTokenInfo?.status : r?.idTagInfo?.status) ?? 'Sin respuesta';
}

async function iniciarCarga(idTag, { remoto = false, remoteStartId } = {}) {
  if (transaccion) return log('Ya hay una carga en curso');
  await enviarEstado('Preparing');
  if (V2) {
    transaccion = { id: `TX${randomBytes(4).toString('hex').toUpperCase()}`, idTag, soc: SOC_INICIAL };
    const r = await eventoTransaccion('Started', remoto ? 'RemoteStart' : 'Authorized', {
      idToken: idTag,
      tipoToken: remoto ? 'Central' : 'ISO14443',
      info: { chargingState: 'Charging', ...(remoteStartId !== undefined ? { remoteStartId } : {}) },
    });
    if (r && r.idTokenInfo && r.idTokenInfo.status !== 'Accepted') {
      log('Inicio rechazado por el servidor:', r.idTokenInfo.status);
      await eventoTransaccion('Ended', 'Deauthorized', { info: { stoppedReason: 'DeAuthorized' } });
      transaccion = null;
      return enviarEstado('Available');
    }
  } else {
    const r = await llamar('StartTransaction', { connectorId: 1, idTag, meterStart: Math.round(medidorWh), timestamp: ahora() });
    if (r?.idTagInfo?.status !== 'Accepted') {
      log('StartTransaction rechazado:', r?.idTagInfo?.status);
      return enviarEstado('Available');
    }
    transaccion = { id: r.transactionId, idTag, soc: SOC_INICIAL };
  }
  await enviarEstado('Charging');
  const kwhPorMuestra = (POTENCIA_KW * INTERVALO_MEDICION_S) / 3600;
  temporizadorMedicion = setInterval(() => {
    if (!transaccion) return;
    const faltaKwh = ((100 - transaccion.soc) / 100) * BATERIA_KWH;
    const entregado = Math.min(kwhPorMuestra, faltaKwh);
    medidorWh += entregado * 1000;
    transaccion.soc = Math.min(100, transaccion.soc + (entregado / BATERIA_KWH) * 100);
    enviarMedicion();
    if (transaccion.soc >= 100) {
      log('🔋 Batería al 100 %: el vehículo terminó la carga');
      detenerCarga('EVDisconnected');
    }
  }, INTERVALO_MEDICION_S * 1000);
  log(`Cargando a ${POTENCIA_KW} kW · transacción ${transaccion.id} · batería ${BATERIA_KWH} kWh desde ${SOC_INICIAL} %`);
}

async function detenerCarga(motivo = 'Remote') {
  if (!transaccion) return log('No hay carga en curso');
  clearInterval(temporizadorMedicion);
  await enviarEstado('Finishing');
  if (V2) {
    const disparador = { Remote: 'RemoteStop', Local: 'StopAuthorized', EVDisconnected: 'EVCommunicationLost', SoftReset: 'ResetCommand', HardReset: 'ResetCommand', ImmediateReset: 'ResetCommand' };
    // El mensaje se arma (con el id y el seqNo de la transacción) antes de soltarla.
    const envio = eventoTransaccion('Ended', disparador[motivo] ?? 'StopAuthorized', {
      info: { stoppedReason: motivo === 'HardReset' || motivo === 'SoftReset' ? 'ImmediateReset' : motivo },
    });
    transaccion = null;
    await envio;
  } else {
    const { id, idTag } = transaccion;
    transaccion = null;
    await llamar('StopTransaction', { transactionId: id, idTag, meterStop: Math.round(medidorWh), timestamp: ahora(), reason: motivo });
  }
  await enviarEstado('Available');
}

// ---------- Comandos que llegan del sistema central ----------

function atender(id, accion, p) {
  log('←', accion, JSON.stringify(p));
  return V2 ? atender201(id, accion, p) : atender16(id, accion, p);
}

function reiniciar(motivo) {
  log(`Reinicio (${motivo}): reconectando en 3 s`);
  // OCPP: antes de reiniciar, el cargador cierra la transacción en curso.
  setTimeout(async () => {
    if (transaccion) await detenerCarga(motivo);
    ws.close(1012, 'Reset');
  }, 500);
}

function atender16(id, accion, p) {
  switch (accion) {
    case 'RemoteStartTransaction':
      if (transaccion || !disponible) return responder(id, { status: 'Rejected' });
      responder(id, { status: 'Accepted' });
      return setTimeout(() => iniciarCarga(p.idTag, { remoto: true }), 1500); // el usuario ya conectó la pistola
    case 'RemoteStopTransaction':
      if (!transaccion || transaccion.id !== p.transactionId) return responder(id, { status: 'Rejected' });
      responder(id, { status: 'Accepted' });
      return setTimeout(() => detenerCarga('Remote'), 1000);
    case 'Reset':
      responder(id, { status: 'Accepted' });
      return reiniciar(p.type === 'Hard' ? 'HardReset' : 'SoftReset');
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

function atender201(id, accion, p) {
  switch (accion) {
    case 'RequestStartTransaction':
      if (transaccion || !disponible) return responder(id, { status: 'Rejected' });
      responder(id, { status: 'Accepted' });
      return setTimeout(() => iniciarCarga(p.idToken.idToken, { remoto: true, remoteStartId: p.remoteStartId }), 1500);
    case 'RequestStopTransaction':
      if (!transaccion || transaccion.id !== p.transactionId) return responder(id, { status: 'Rejected' });
      responder(id, { status: 'Accepted' });
      return setTimeout(() => detenerCarga('Remote'), 1000);
    case 'GetTransactionStatus':
      return responder(id, {
        ongoingIndicator: Boolean(transaccion && (!p.transactionId || p.transactionId === transaccion.id)),
        messagesInQueue: cola.length > 0,
      });
    case 'Reset':
      if (p.type === 'OnIdle' && transaccion) {
        responder(id, { status: 'Scheduled' });
        return log('Reinicio programado para cuando termine la carga');
      }
      responder(id, { status: 'Accepted' });
      return reiniciar('ImmediateReset');
    case 'ChangeAvailability':
      disponible = p.operationalStatus === 'Operative';
      responder(id, { status: transaccion ? 'Scheduled' : 'Accepted' });
      if (!transaccion) enviarEstado(disponible ? 'Available' : 'Unavailable');
      return;
    case 'GetVariables':
      return responder(id, {
        getVariableResult: p.getVariableData.map((d) => {
          const clave = VARIABLES_201[`${d.component.name}.${d.variable.name}`];
          return clave
            ? { attributeStatus: 'Accepted', component: d.component, variable: d.variable, attributeValue: config[clave] }
            : { attributeStatus: 'UnknownVariable', component: d.component, variable: d.variable };
        }),
      });
    case 'SetVariables':
      return responder(id, {
        setVariableResult: p.setVariableData.map((d) => {
          const clave = VARIABLES_201[`${d.component.name}.${d.variable.name}`];
          if (!clave) return { attributeStatus: 'UnknownVariable', component: d.component, variable: d.variable };
          config[clave] = d.attributeValue;
          if (clave === 'HeartbeatInterval') programarHeartbeat();
          return { attributeStatus: 'Accepted', component: d.component, variable: d.variable };
        }),
      });
    case 'UnlockConnector':
      return responder(id, { status: transaccion ? 'OngoingAuthorizedTransaction' : 'Unlocked' });
    case 'ClearCache':
      return responder(id, { status: 'Accepted' });
    case 'DataTransfer':
      return responder(id, { status: 'Accepted', data: 'OK' });
    case 'TriggerMessage': {
      const soportados = {
        Heartbeat: () => llamar('Heartbeat', {}),
        StatusNotification: () => enviarEstado(estado),
        MeterValues: enviarMedicion,
        TransactionEvent: () => transaccion && eventoTransaccion('Updated', 'Trigger'),
        BootNotification: boot,
      };
      if (!soportados[p.requestedMessage]) return responder(id, { status: 'NotImplemented' });
      responder(id, { status: 'Accepted' });
      return setTimeout(soportados[p.requestedMessage], 300);
    }
    default:
      ws.send(JSON.stringify([4, id, 'NotImplemented', `${accion} no soportado por el simulador`, {}]));
  }
}

async function boot() {
  const r = V2
    ? await llamar('BootNotification', {
        reason: 'PowerUp',
        chargingStation: { model: 'MDXDC3001', vendorName: 'SSWL', serialNumber: serie, firmwareVersion: 'SSWL_DC-V1.0.69' },
      })
    : await llamar('BootNotification', {
        chargePointVendor: 'SSWL',
        chargePointModel: 'MDXDC3001',
        chargePointSerialNumber: serie,
        firmwareVersion: 'SSWL_DC-V1.0.69',
      });
  log(`BootNotification (OCPP ${VERSION}):`, r?.status, '· hora del servidor', r?.currentTime);
  if (r?.status !== 'Accepted') return log('El servidor rechazó el cargador (¿está registrado en el panel?)');
  config.HeartbeatInterval = String(r.interval ?? 300);
  programarHeartbeat();
  // Primero lo que quedó guardado sin conexión (inicio/cierre de transacciones), en orden.
  while (cola.length) {
    const m = cola.shift();
    log('▶ Enviando lo guardado:', m.accion, m.payload.eventType ?? '');
    m.resolver(await llamar(m.accion, m.payload));
  }
  if (transaccion) {
    await enviarEstado('Charging');
    enviarMedicion();
    log(`La carga siguió sin conexión · transacción ${transaccion.id}`);
  } else {
    await enviarEstado(disponible ? 'Available' : 'Unavailable');
  }
}

let ultimoRechazo = null;
let reintentoMs = 3000;

function explicarRechazo(estadoHttp) {
  if (estadoHttp === ultimoRechazo) return; // explicar una sola vez, no en cada reintento
  ultimoRechazo = estadoHttp;
  if (estadoHttp === 404) {
    log(`✗ El servidor respondió 404. Revisa:
    1. Que el número de serie "${serie}" esté registrado en el panel (Cargadores), escrito igual.
    2. Que el backend del servidor esté actualizado y con el gateway OCPP: en la Consola OCPP debe
       aparecer "ConexionRechazada" por cada intento; si no aparece nada, actualiza y reinicia el backend.
    3. Que la URL apunte al puerto de la API (3000), no al del panel (3001).`);
  } else if (estadoHttp === 400) {
    log(`✗ El servidor rechazó la versión OCPP ${VERSION}. Revisa la "Versión OCPP" del cargador en el panel
    (Cargadores): debe ser "Automática" o ${VERSION}.`);
  } else {
    log(`✗ El servidor rechazó la conexión con HTTP ${estadoHttp}.`);
  }
}

function conectar() {
  const url = `${urlBase.replace(/\/+$/, '')}/${encodeURIComponent(serie)}`;
  log(`Conectando a ${url} (OCPP ${VERSION})`);
  ws = new WebSocket(url, [V2 ? 'ocpp2.0.1' : 'ocpp1.6']);
  ws.on('open', () => {
    ultimoRechazo = null;
    reintentoMs = 3000;
    boot();
  });
  ws.on('unexpected-response', (_req, res) => {
    explicarRechazo(res.statusCode);
    reintentoMs = 15000; // rechazado: reintentar más despacio
    ws.terminate();
  });
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
    // La carga NO se detiene por perder la red: el medidor sigue y el cierre se guarda en la cola.
    for (const [mid, p] of pendientes) {
      pendientes.delete(mid);
      p.resolver(null);
    }
    const espera = Math.max(reintentoMs, sinRedHasta - Date.now());
    log(`Conexión cerrada (${codigo}). Reintentando en ${Math.round(espera / 1000)} s…${transaccion ? ' (la carga sigue)' : ''}`);
    setTimeout(conectar, espera);
  });
  ws.on('error', (e) => {
    if (!ultimoRechazo) log('Error:', e.message);
  });
}

readline.createInterface({ input: process.stdin }).on('line', async (linea) => {
  const [cmd, valor] = linea.trim().split(/\s+/);
  if (cmd === 't') {
    const tarjeta = valor || 'AF22FF0B';
    const resultado = await autorizar(tarjeta);
    if (resultado === 'Accepted') iniciarCarga(tarjeta);
    else log('Tarjeta rechazada:', resultado);
  } else if (cmd === 's') detenerCarga('Local');
  else if (cmd === 'f') enviarEstado('Faulted', 'GroundFailure');
  else if (cmd === 'a') enviarEstado('Available');
  else if (cmd === 'c') {
    const seg = Number(valor) || 30;
    sinRedHasta = Date.now() + seg * 1000;
    log(`✂ Corte de red por ${seg} s`);
    ws.terminate();
  } else if (cmd === 'x') {
    clearInterval(temporizadorMedicion);
    if (transaccion) log(`⚠ Reinicio con pérdida de la transacción ${transaccion.id} (no se enviará el cierre)`);
    transaccion = null;
    cola.length = 0;
    ws.close(1012, 'Reinicio');
  } else if (cmd === 'q') process.exit(0);
});

conectar();
