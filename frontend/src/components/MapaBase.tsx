import { ReactNode, useEffect } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';

// Mapa con Leaflet y teselas oscuras de CARTO sobre datos de OpenStreetMap (sin llave de API).
// Se carga solo en el navegador: usar el componente Mapa (import dinámico), no este directamente.

export type TonoPin = 'voltaje' | 'flujo' | 'falla' | 'tenue';

export interface Marcador {
  id: string;
  lat: number;
  lng: number;
  tono: TonoPin;
  etiqueta?: string; // texto corto dentro del pin (ej. cantidad de cargadores libres)
  titulo?: string; // texto accesible y tooltip
  popup?: ReactNode;
  alClic?: () => void;
}

export interface PropsMapa {
  marcadores?: Marcador[];
  centro?: [number, number];
  zoom?: number;
  alto?: number | string;
  ajustar?: boolean; // encuadrar todos los marcadores
  // Selector de ubicación: punto arrastrable y clic en el mapa para moverlo.
  punto?: { lat: number; lng: number } | null;
  alElegir?: (lat: number, lng: number) => void;
  miUbicacion?: { lat: number; lng: number } | null;
}

export const CENTRO_BOGOTA: [number, number] = [4.711, -74.0721];

const icono = (tono: TonoPin, etiqueta?: string, titulo?: string) =>
  L.divIcon({
    className: 'pin-contenedor',
    html: `<span class="pin pin-${tono}" title="${(titulo ?? '').replace(/"/g, '&quot;')}"><span>${etiqueta ?? ''}</span></span>`,
    iconSize: [30, 40],
    iconAnchor: [15, 38],
    popupAnchor: [0, -34],
  });

const iconoYo = L.divIcon({ className: 'pin-contenedor', html: '<span class="pin-yo"></span>', iconSize: [18, 18], iconAnchor: [9, 9] });

function Clics({ alElegir }: { alElegir?: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => alElegir?.(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6))) });
  return null;
}

function Encuadre({ puntos, activo }: { puntos: [number, number][]; activo: boolean }) {
  const mapa = useMap();
  const clave = puntos.map((p) => p.join(',')).join(';');
  useEffect(() => {
    if (!activo || !puntos.length) return;
    if (puntos.length === 1) mapa.setView(puntos[0], Math.max(mapa.getZoom(), 15));
    else mapa.fitBounds(L.latLngBounds(puntos), { padding: [40, 40], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, activo]);
  return null;
}

// Mantiene el punto del selector a la vista cuando cambia desde los campos de texto.
function SeguirPunto({ punto }: { punto?: { lat: number; lng: number } | null }) {
  const mapa = useMap();
  useEffect(() => {
    if (punto && !mapa.getBounds().contains([punto.lat, punto.lng])) mapa.setView([punto.lat, punto.lng], Math.max(mapa.getZoom(), 15));
  }, [punto, mapa]);
  return null;
}

export default function MapaBase({
  marcadores = [],
  centro,
  zoom = 12,
  alto = 360,
  ajustar = true,
  punto,
  alElegir,
  miUbicacion,
}: PropsMapa) {
  const inicio = centro ?? (punto ? ([punto.lat, punto.lng] as [number, number]) : marcadores[0] ? ([marcadores[0].lat, marcadores[0].lng] as [number, number]) : CENTRO_BOGOTA);
  return (
    <div className="mapa" style={{ height: alto }}>
      <MapContainer center={inicio} zoom={zoom} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <Encuadre puntos={marcadores.map((m) => [m.lat, m.lng])} activo={ajustar && !punto} />
        {alElegir && <Clics alElegir={alElegir} />}
        {punto && <SeguirPunto punto={punto} />}
        {marcadores.map((m) => (
          <Marker
            key={m.id}
            position={[m.lat, m.lng]}
            icon={icono(m.tono, m.etiqueta, m.titulo)}
            title={m.titulo}
            eventHandlers={m.alClic ? { click: m.alClic } : undefined}
          >
            {m.popup && <Popup>{m.popup}</Popup>}
          </Marker>
        ))}
        {punto && (
          <Marker
            position={[punto.lat, punto.lng]}
            icon={icono('voltaje', '', 'Ubicación elegida')}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const p = (e.target as L.Marker).getLatLng();
                alElegir?.(Number(p.lat.toFixed(6)), Number(p.lng.toFixed(6)));
              },
            }}
          />
        )}
        {miUbicacion && <Marker position={[miUbicacion.lat, miUbicacion.lng]} icon={iconoYo} title="Tu ubicación" />}
      </MapContainer>
    </div>
  );
}
