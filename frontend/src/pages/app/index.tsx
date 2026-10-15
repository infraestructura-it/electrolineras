import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { LocateFixed, Navigation, Star } from 'lucide-react';
import Mapa, { CENTRO_BOGOTA, Marcador, TonoPin } from '@/components/Mapa';
import { conductorApi, Disponibilidad, ElectrolineraMapa, formatoCOP, monitorApi } from '@/lib/api';

// App del conductor: mapa de electrolineras con la disponibilidad de cada cargador, ordenadas
// por distancia, y acceso directo a los cargadores que ya ha usado ("Mis cargadores").

const TONO: Record<Disponibilidad, TonoPin> = { disponible: 'flujo', ocupado: 'voltaje', fuera_de_servicio: 'falla', sin_conexion: 'tenue' };
const TEXTO: Record<Disponibilidad, string> = {
  disponible: 'Disponible',
  ocupado: 'Ocupado',
  fuera_de_servicio: 'Fuera de servicio',
  sin_conexion: 'Sin conexión',
};
const CLASE: Record<Disponibilidad, string> = { disponible: 'ok', ocupado: 'alerta', fuera_de_servicio: 'falla', sin_conexion: '' };

// Distancia en km (fórmula del haversine).
function distanciaKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (g: number) => (g * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const formatoKm = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toLocaleString('es-CO', { maximumFractionDigits: 1 })} km`);

export default function MapaConductor() {
  const [sitios, setSitios] = useState<ElectrolineraMapa[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [yo, setYo] = useState<{ lat: number; lng: number } | null>(null);
  const [ubicando, setUbicando] = useState(false);
  const [soloLibres, setSoloLibres] = useState(false);
  const [soloMios, setSoloMios] = useState(false);
  const [mios, setMios] = useState<Set<string>>(new Set());
  const [elegido, setElegido] = useState<string | null>(null);

  useEffect(() => {
    const cargar = () =>
      monitorApi
        .mapa()
        .then((d) => {
          setSitios(d);
          setError(null);
        })
        .catch(() => setError('No pudimos cargar el mapa. Revisa tu conexión.'));
    cargar();
    const t = setInterval(cargar, 20_000); // la disponibilidad cambia: refrescar
    if (conductorApi.hayCuenta()) {
      conductorApi
        .cargas()
        .then((c) => setMios(new Set(c.map((s) => s.numero_serie))))
        .catch(() => undefined);
    }
    ubicar(false);
    return () => clearInterval(t);
  }, []);

  function ubicar(avisar = true) {
    if (!navigator.geolocation) return;
    setUbicando(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setYo({ lat: p.coords.latitude, lng: p.coords.longitude });
        setUbicando(false);
      },
      () => {
        setUbicando(false);
        if (avisar) setError('No pudimos obtener tu ubicación. Revisa el permiso del navegador.');
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  const lista = useMemo(() => {
    if (!sitios) return [];
    return sitios
      .map((s) => ({
        ...s,
        libres: s.cargadores.filter((c) => c.disponibilidad === 'disponible').length,
        mio: s.cargadores.some((c) => mios.has(c.numero_serie)),
        km: yo ? distanciaKm(yo, { lat: s.latitud, lng: s.longitud }) : null,
      }))
      .filter((s) => (!soloLibres || s.libres > 0) && (!soloMios || s.mio))
      .sort((a, b) => (a.km ?? 0) - (b.km ?? 0) || b.libres - a.libres);
  }, [sitios, mios, yo, soloLibres, soloMios]);

  const marcadores: Marcador[] = lista.map((s) => ({
    id: s.id,
    lat: s.latitud,
    lng: s.longitud,
    tono: s.libres > 0 ? 'flujo' : s.cargadores.some((c) => c.disponibilidad === 'ocupado') ? 'voltaje' : 'tenue',
    etiqueta: String(s.libres),
    titulo: `${s.nombre}: ${s.libres} de ${s.cargadores.length} libres`,
    alClic: () => {
      setElegido(s.id);
      document.getElementById(`sitio-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },
  }));

  return (
    <>
      <section className="app-encabezado">
        <h1 className="app-titulo">Electrolineras</h1>
        <button className="btn sec chico" onClick={() => ubicar()} disabled={ubicando} title="Usar mi ubicación">
          <LocateFixed size={16} aria-hidden="true" />
          {ubicando ? 'Ubicando…' : 'Cerca de mí'}
        </button>
      </section>

      <div className="app-mapa">
        <Mapa marcadores={marcadores} centro={yo ? [yo.lat, yo.lng] : CENTRO_BOGOTA} zoom={12} alto={320} miUbicacion={yo} ajustar={!yo} />
      </div>

      <div className="app-filtros" role="group" aria-label="Filtros">
        <button className={`chip ${soloLibres ? 'activo' : ''}`} aria-pressed={soloLibres} onClick={() => setSoloLibres((v) => !v)}>
          Con cargador libre
        </button>
        {mios.size > 0 && (
          <button className={`chip ${soloMios ? 'activo' : ''}`} aria-pressed={soloMios} onClick={() => setSoloMios((v) => !v)}>
            <Star size={13} aria-hidden="true" /> Mis cargadores
          </button>
        )}
      </div>

      {error && <p className="app-error">{error}</p>}
      {!sitios && !error && <p className="app-texto app-centro">Cargando electrolineras…</p>}
      {sitios && lista.length === 0 && <p className="app-panel app-texto">No hay electrolineras con esos filtros.</p>}

      {lista.map((s) => (
        <section key={s.id} id={`sitio-${s.id}`} className={`app-panel app-sitio ${elegido === s.id ? 'elegido' : ''}`}>
          <div className="app-sitio-cabeza">
            <div>
              <h2>
                {s.nombre} {s.mio && <Star size={14} className="texto-voltaje" aria-label="Ya cargaste aquí" />}
              </h2>
              <p className="app-texto">{[s.direccion, s.ciudad, s.empresa].filter(Boolean).join(' · ')}</p>
              {s.horario && <p className="app-nota">Horario: {s.horario}</p>}
            </div>
            <div className="app-sitio-dist">
              {s.km != null && <strong>{formatoKm(s.km)}</strong>}
              <span className={`estado ${s.libres ? 'ok' : ''}`}>
                {s.cargadores.length ? `${s.libres}/${s.cargadores.length} libres` : 'Próximamente'}
              </span>
            </div>
          </div>

          <ul className="app-sitio-cargadores">
            {s.cargadores.map((c) => (
              <li key={c.numero_serie}>
                <Link href={`/c/${encodeURIComponent(c.numero_serie)}`}>
                  <span>
                    <strong>{c.ubicacion || c.numero_serie}</strong>
                    <span className="app-nota">
                      DC {c.potencia_kw} kW{c.tarifa_por_kwh != null ? ` · ${formatoCOP(c.tarifa_por_kwh)}/kWh` : ''}
                    </span>
                  </span>
                  <span className={`estado ${CLASE[c.disponibilidad]}`}>{TEXTO[c.disponibilidad]}</span>
                </Link>
              </li>
            ))}
          </ul>

          <a
            className="btn sec app-boton-sec"
            href={`https://www.google.com/maps/dir/?api=1&destination=${s.latitud},${s.longitud}`}
            target="_blank"
            rel="noreferrer"
          >
            <Navigation size={16} aria-hidden="true" /> Cómo llegar
          </a>
        </section>
      ))}
    </>
  );
}
