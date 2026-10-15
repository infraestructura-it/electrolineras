import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import { BatteryCharging, CircleOff, Maximize2, PlugZap, TriangleAlert, WifiOff, Zap } from 'lucide-react';
import { useDatos } from '@/components/ui';
import { CargadorMonitor, Disponibilidad, formatoCOP, formatoKwh, haceCuanto, monitorApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';

// Monitor en vivo de los cargadores. Se abre en otra pestaña (pantalla completa) para dejarlo
// a la vista en una sala de control o en un televisor; se actualiza cada 3 segundos.

const ESTADO: Record<Disponibilidad, { texto: string; clase: string; icono: typeof Zap }> = {
  disponible: { texto: 'Disponible', clase: 'disponible', icono: PlugZap },
  ocupado: { texto: 'Cargando', clase: 'cargando', icono: BatteryCharging },
  fuera_de_servicio: { texto: 'Fuera de servicio', clase: 'falla', icono: TriangleAlert },
  sin_conexion: { texto: 'Sin conexión', clase: 'apagado', icono: WifiOff },
};

const STATUS_CONECTOR: Record<string, string> = {
  Available: 'Libre',
  Preparing: 'Conectando',
  Charging: 'Cargando',
  SuspendedEV: 'Pausado por el vehículo',
  SuspendedEVSE: 'Pausado por el cargador',
  Finishing: 'Terminando',
  Reserved: 'Reservado',
  Unavailable: 'No disponible',
  Faulted: 'En falla',
};

function duracion(desde: string, ahora: number) {
  const seg = Math.max(0, Math.floor((ahora - Date.parse(desde)) / 1000));
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const dos = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${dos(m)}:${dos(seg % 60)}` : `${dos(m)}:${dos(seg % 60)}`;
}

export default function MonitorPage() {
  const router = useRouter();
  const { usuario, cargando } = useAuth();
  const tablero = useDatos(() => (usuario ? monitorApi.tablero() : Promise.resolve(null)), 3000, usuario?.id);
  const [ahora, setAhora] = useState(Date.now());
  const [filtro, setFiltro] = useState('');

  useEffect(() => {
    if (!cargando && !usuario) router.replace(`/login?siguiente=${encodeURIComponent('/monitor')}`);
  }, [cargando, usuario, router]);

  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const datos = tablero.datos;
  const sitios = useMemo(() => {
    const nombres = new Set((datos?.cargadores ?? []).map((c) => c.electrolinera?.nombre ?? 'Sin electrolinera'));
    return [...nombres].sort((a, b) => a.localeCompare(b, 'es'));
  }, [datos]);
  const grupos = useMemo(() => {
    const mapa = new Map<string, CargadorMonitor[]>();
    for (const c of datos?.cargadores ?? []) {
      const sitio = c.electrolinera?.nombre ?? 'Sin electrolinera';
      if (filtro && sitio !== filtro) continue;
      mapa.set(sitio, [...(mapa.get(sitio) ?? []), c]);
    }
    return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b, 'es'));
  }, [datos, filtro]);

  if (cargando || !usuario) return <div className="pantalla-carga">Cargando monitor…</div>;

  const r = datos?.resumen;
  const desactualizado = datos && ahora - Date.parse(datos.generado) > 15000;

  return (
    <div className="monitor">
      <Head>
        <title>Monitor en vivo · Electrolineras</title>
      </Head>
      <header className="monitor-cabeza">
        <div className="monitor-marca">
          <span className="marca-sello" aria-hidden="true">
            <Zap size={18} strokeWidth={2.5} />
          </span>
          <div>
            <h1>Monitor en vivo</h1>
            <div className="secundario">
              {new Date(ahora).toLocaleString('es-CO', { weekday: 'long', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
          </div>
        </div>
        <div className="monitor-controles">
          {sitios.length > 1 && (
            <select value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Filtrar por electrolinera">
              <option value="">Todas las electrolineras</option>
              {sitios.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
          <button className="btn chico sec" onClick={() => document.documentElement.requestFullscreen?.()}>
            <Maximize2 size={15} /> Pantalla completa
          </button>
        </div>
      </header>

      {(tablero.error || desactualizado) && (
        <div className="mensaje-error" role="alert">
          <CircleOff size={18} aria-hidden="true" /> Sin respuesta del servidor: los datos pueden estar desactualizados.
        </div>
      )}

      {r && (
        <div className="monitor-resumen">
          <Cifra etiqueta="Cargadores" valor={r.total} />
          <Cifra etiqueta="Disponibles" valor={r.disponibles} clase="disponible" />
          <Cifra etiqueta="Cargando" valor={r.cargando} clase="cargando" />
          <Cifra etiqueta="Fuera de servicio" valor={r.fuera_de_servicio} clase="falla" />
          <Cifra etiqueta="Sin conexión" valor={r.sin_conexion} clase="apagado" />
          <Cifra etiqueta="Potencia entregada" valor={`${r.potencia_kw} kW`} clase="cargando" />
        </div>
      )}

      {datos && datos.cargadores.length === 0 && (
        <div className="vacio">
          <h2>No hay cargadores para mostrar</h2>
          <p>Registra cargadores en el panel o revisa la zona asignada a tu usuario.</p>
        </div>
      )}

      {grupos.map(([sitio, lista]) => (
        <section key={sitio} className="monitor-sitio">
          <h2>
            {sitio}
            {lista[0].electrolinera?.ciudad && <span className="secundario"> · {lista[0].electrolinera.ciudad}</span>}
            {lista[0].zona && <span className="estado">{lista[0].zona}</span>}
          </h2>
          <div className="monitor-rejilla">
            {lista.map((c) => (
              <Tarjeta key={c.numero_serie} c={c} ahora={ahora} />
            ))}
          </div>
        </section>
      ))}

      <footer className="secundario monitor-pie">
        {datos ? `Actualizado ${haceCuanto(datos.generado)} · cada 3 s` : 'Cargando…'} · {usuario.nombre}
      </footer>
    </div>
  );
}

function Cifra({ etiqueta, valor, clase = '' }: { etiqueta: string; valor: number | string; clase?: string }) {
  return (
    <div className={`monitor-cifra ${clase}`}>
      <div className="monitor-cifra-valor">{valor}</div>
      <div className="monitor-cifra-etiqueta">{etiqueta}</div>
    </div>
  );
}

function Tarjeta({ c, ahora }: { c: CargadorMonitor; ahora: number }) {
  const e = ESTADO[c.disponibilidad];
  const Icono = e.icono;
  const s = c.sesion;
  const status = c.conexion?.conector?.status;
  return (
    <article className={`monitor-tarjeta ${e.clase}`} aria-label={`${c.numero_serie}: ${e.texto}`}>
      <div className="monitor-tarjeta-cabeza">
        <div style={{ minWidth: 0 }}>
          <div className="cargador-serie">{c.numero_serie}</div>
          <div className="secundario">{[c.ubicacion, `${c.potencia_kw} kW`].filter(Boolean).join(' · ')}</div>
        </div>
        <span className="monitor-estado">
          <Icono size={16} aria-hidden="true" /> {e.texto}
        </span>
      </div>

      {s ? (
        <div className="monitor-sesion">
          <div>
            <div className="dato-etiqueta">Energía</div>
            <div className="monitor-grande">{formatoKwh(s.kwh_consumidos)}</div>
          </div>
          <div>
            <div className="dato-etiqueta">Potencia</div>
            <div className="dato-valor">{s.potencia_kw != null ? `${s.potencia_kw} kW` : '—'}</div>
          </div>
          <div>
            <div className="dato-etiqueta">Tiempo</div>
            <div className="dato-valor mono">{duracion(s.inicio, ahora)}</div>
          </div>
          <div>
            <div className="dato-etiqueta">Valor</div>
            <div className="dato-valor">{formatoCOP(s.costo_estimado)}</div>
          </div>
          <div className="secundario monitor-usuario">
            {s.origen === 'rfid' ? s.usuario_id : `${s.origen === 'panel' ? 'Consola OCPP' : 'App'} · ${s.usuario_id}`}
          </div>
        </div>
      ) : (
        <div className="monitor-libre secundario">
          {c.disponibilidad === 'disponible'
            ? 'Listo para cargar'
            : c.disponibilidad === 'sin_conexion'
              ? 'El cargador no está conectado a la plataforma'
              : 'No acepta cargas'}
        </div>
      )}

      <div className="monitor-tarjeta-pie">
        <span className={`led ${c.conexion ? 'encendido' : ''}`} aria-hidden="true" />
        {c.conexion ? (
          <>
            OCPP {c.conexion.version} · {status ? STATUS_CONECTOR[status] ?? status : 'sin estado'} · latido{' '}
            {haceCuanto(c.conexion.ultimo_heartbeat ?? c.conexion.ultimo_mensaje)}
          </>
        ) : (
          'Desconectado'
        )}
      </div>
    </article>
  );
}
