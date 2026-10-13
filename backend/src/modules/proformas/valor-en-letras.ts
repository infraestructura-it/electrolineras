// Convierte un valor en pesos a letras, como se escribe en las facturas colombianas:
// 282895 → "DOSCIENTOS OCHENTA Y DOS MIL OCHOCIENTOS NOVENTA Y CINCO PESOS M/CTE"

const UNIDADES = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
const DIEZ_A_VEINTINUEVE = [
  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE',
  'VEINTE', 'VEINTIUNO', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE',
  'VEINTIOCHO', 'VEINTINUEVE',
];
const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = [
  '', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS',
  'OCHOCIENTOS', 'NOVECIENTOS',
];

// 0..999
function centenas(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS[c]);
  if (resto >= 10 && resto < 30) partes.push(DIEZ_A_VEINTINUEVE[resto - 10]);
  else if (resto >= 30) {
    const d = Math.floor(resto / 10);
    const u = resto % 10;
    partes.push(u ? `${DECENAS[d]} Y ${UNIDADES[u]}` : DECENAS[d]);
  } else if (resto > 0) partes.push(UNIDADES[resto]);
  return partes.join(' ');
}

// "UNO" se apocopa a "UN" delante de MIL / MILLONES / PESOS ("VEINTIÚN MIL", "UN MILLÓN").
const apocopar = (texto: string) => texto.replace(/VEINTIUNO$/, 'VEINTIÚN').replace(/UNO$/, 'UN');

function enteroEnLetras(n: number): string {
  if (n === 0) return 'CERO';
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const partes: string[] = [];

  if (millones) {
    partes.push(millones === 1 ? 'UN MILLÓN' : `${apocopar(enteroEnLetras(millones))} MILLONES`);
  }
  if (miles) partes.push(miles === 1 ? 'MIL' : `${apocopar(centenas(miles))} MIL`);
  if (resto) partes.push(centenas(resto));
  return partes.join(' ');
}

export function valorEnLetras(valor: number): string {
  const pesos = Math.round(valor);
  if (!Number.isFinite(pesos) || pesos < 0) return '';
  if (pesos === 1) return 'UN PESO M/CTE';
  const letras = apocopar(enteroEnLetras(pesos));
  // "UN MILLÓN DE PESOS", "DOS MILLONES DE PESOS": se agrega "DE" cuando termina en millón/millones.
  const de = /MILL(ÓN|ONES)$/.test(letras) ? ' DE' : '';
  return `${letras}${de} PESOS M/CTE`;
}
