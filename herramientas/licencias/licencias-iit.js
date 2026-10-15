#!/usr/bin/env node
// Herramienta de Infraestructura-IT para emitir licencias de activación de Electrolineras.
// Firma con Ed25519: la LLAVE PRIVADA se queda en el equipo de IIT (nunca en el repositorio ni en
// el servidor del cliente) y la LLAVE PÚBLICA va en backend/licencia-publica.pem para verificar.
// Sin dependencias: solo Node.js 18+.
//
//   node licencias-iit.js llaves [carpeta]
//       Crea iit-licencias-privada.pem (secreta) e iit-licencias-publica.pem.
//
//   node licencias-iit.js emitir --privada <archivo.pem> --empresa "Cargas SAS" --nit 900123456-7 \
//        --cargadores 10 --vence 2027-12-31
//       Imprime la licencia (un texto) para pegar en el panel: Licencias → Activar licencia.
//
//   node licencias-iit.js ver <licencia> [--publica <archivo.pem>]
//       Muestra el contenido de una licencia y, con la llave pública, si la firma es válida.
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const [comando, ...resto] = process.argv.slice(2);
const opcion = (nombre) => {
  const i = resto.indexOf(`--${nombre}`);
  return i >= 0 ? resto[i + 1] : undefined;
};
const salir = (mensaje) => {
  console.error(mensaje);
  process.exit(1);
};
const normalizarNit = (nit) => String(nit ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();

if (comando === 'llaves') {
  const carpeta = path.resolve(resto[0] && !resto[0].startsWith('--') ? resto[0] : '.');
  const privada = path.join(carpeta, 'iit-licencias-privada.pem');
  const publica = path.join(carpeta, 'iit-licencias-publica.pem');
  if (fs.existsSync(privada)) salir(`Ya existe ${privada}. No la sobrescribo: las licencias emitidas dependen de ella.`);
  const par = crypto.generateKeyPairSync('ed25519');
  fs.mkdirSync(carpeta, { recursive: true });
  fs.writeFileSync(privada, par.privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  fs.writeFileSync(publica, par.publicKey.export({ type: 'spki', format: 'pem' }));
  console.log(`Llave privada (SECRETA, guárdala con respaldo y fuera del repositorio): ${privada}`);
  console.log(`Llave pública: ${publica}`);
  console.log('Copia la pública a backend/licencia-publica.pem del repositorio para activar el licenciamiento.');
} else if (comando === 'emitir') {
  const archivo = opcion('privada');
  const empresa = opcion('empresa');
  const nit = normalizarNit(opcion('nit'));
  const cargadores = Number(opcion('cargadores'));
  const vence = opcion('vence');
  if (!archivo || !empresa || !nit || !cargadores || !vence) {
    salir('Uso: emitir --privada <archivo.pem> --empresa "<nombre>" --nit <nit> --cargadores <n> --vence AAAA-MM-DD');
  }
  if (!Number.isInteger(cargadores) || cargadores < 1) salir('--cargadores debe ser un entero mayor que 0');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vence) || Number.isNaN(Date.parse(vence))) salir('--vence debe tener el formato AAAA-MM-DD');
  const llave = crypto.createPrivateKey(fs.readFileSync(archivo));
  const datos = {
    v: 1,
    id: `LIC-${crypto.randomBytes(5).toString('hex').toUpperCase()}`,
    empresa,
    nit,
    max_cargadores: cargadores,
    emitida: new Date().toISOString().slice(0, 10),
    vence,
    emisor: 'Infraestructura-IT',
  };
  const cuerpo = Buffer.from(JSON.stringify(datos)).toString('base64url');
  const firma = crypto.sign(null, Buffer.from(cuerpo), llave).toString('base64url');
  console.log(`\nLicencia ${datos.id} para ${empresa} (NIT ${nit}): ${cargadores} cargador(es), vence ${vence}\n`);
  console.log(`${cuerpo}.${firma}\n`);
} else if (comando === 'ver') {
  const licencia = resto.find((r) => !r.startsWith('--') && r.includes('.'));
  if (!licencia) salir('Uso: ver <licencia> [--publica <archivo.pem>]');
  const [cuerpo, firma] = licencia.trim().split('.');
  console.log(JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8')));
  const publica = opcion('publica');
  if (publica) {
    const ok = crypto.verify(null, Buffer.from(cuerpo), crypto.createPublicKey(fs.readFileSync(publica)), Buffer.from(firma, 'base64url'));
    console.log(ok ? 'Firma VÁLIDA' : 'Firma NO válida');
  }
} else {
  salir('Comandos: llaves [carpeta] · emitir --privada ... · ver <licencia>. Detalle al inicio de este archivo.');
}
