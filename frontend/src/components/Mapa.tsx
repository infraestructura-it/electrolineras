import dynamic from 'next/dynamic';
import type { PropsMapa } from './MapaBase';

export type { Marcador, PropsMapa, TonoPin } from './MapaBase';
// (no reexportar valores de MapaBase: importarlo en el servidor cargaría Leaflet sin window)
export const CENTRO_BOGOTA: [number, number] = [4.711, -74.0721];

// Leaflet usa window: el mapa se carga solo en el navegador.
const Mapa = dynamic<PropsMapa>(() => import('./MapaBase'), {
  ssr: false,
  loading: () => <div className="mapa mapa-cargando">Cargando mapa…</div>,
});

export default Mapa;
