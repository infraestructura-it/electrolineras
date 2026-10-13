// Comodidades por dispositivo en localStorage: recordar el contacto del usuario y la
// última sesión por cargador. Nada de esto es crítico: si el navegador bloquea el
// almacenamiento, la app sigue funcionando sin estos atajos.

const CLAVE_CONTACTO = 'electrolineras:contacto';
const claveSesion = (serie: string) => `electrolineras:sesion:${serie}`;

function leer(clave: string): string | null {
  try {
    return window.localStorage.getItem(clave);
  } catch {
    return null;
  }
}

function escribir(clave: string, valor: string) {
  try {
    window.localStorage.setItem(clave, valor);
  } catch {
    /* almacenamiento no disponible */
  }
}

export const leerContacto = () => leer(CLAVE_CONTACTO) ?? '';
export const guardarContacto = (contacto: string) => escribir(CLAVE_CONTACTO, contacto);
export const leerSesionGuardada = (serie: string) => leer(claveSesion(serie));
export const guardarSesion = (serie: string, id: string) => escribir(claveSesion(serie), id);
