import { useMemo, useState } from 'react';
import { Clock, Crosshair, MapPin, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import Mapa, { Marcador } from '@/components/Mapa';
import { Encabezado, MensajeError, Modal, useDatos } from '@/components/ui';
import { cargadoresApi, Electrolinera, electrolineasApi, operadoresApi, zonasApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type Dialogo = { tipo: 'nueva' } | { tipo: 'editar'; e: Electrolinera } | null;

export default function ElectrolineasPage() {
  const { esAdmin, puedeGestionar } = useAuth();
  const electrolineras = useDatos(() => electrolineasApi.listar());
  const cargadores = useDatos(() => cargadoresApi.listar());
  const zonas = useDatos(() => zonasApi.listar());
  const operadores = useDatos(() => operadoresApi.listar());
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [error, setError] = useState<string | null>(null);
  const [enfocada, setEnfocada] = useState<string | null>(null);

  const lista = electrolineras.datos ?? [];
  const cargadoresDe = (id: string) => (cargadores.datos ?? []).filter((c) => c.electrolinera_id === id);
  const sinSitio = (cargadores.datos ?? []).filter((c) => !c.electrolinera_id);
  const nombreZona = (id: string | null) => zonas.datos?.find((z) => z.id === id)?.nombre ?? null;
  const nombreEmpresa = (id: string) => operadores.datos?.find((o) => o.id === id)?.nombre ?? '';

  const marcadores = useMemo<Marcador[]>(
    () =>
      lista
        .filter((e) => e.latitud !== null && e.longitud !== null)
        .map((e) => {
          const n = (cargadores.datos ?? []).filter((c) => c.electrolinera_id === e.id).length;
          return {
            id: e.id,
            lat: e.latitud!,
            lng: e.longitud!,
            tono: n ? 'flujo' : 'tenue',
            etiqueta: String(n),
            titulo: `${e.nombre} · ${n} cargador(es)`,
            popup: (
              <>
                <strong>{e.nombre}</strong>
                <div>{[e.direccion, e.ciudad].filter(Boolean).join(', ') || 'Sin dirección'}</div>
                <div>{n} cargador(es)</div>
              </>
            ),
            alClic: () => setEnfocada(e.id),
          };
        }),
    [lista, cargadores.datos],
  );

  async function eliminar(e: Electrolinera) {
    if (!window.confirm(`¿Eliminar la electrolinera ${e.nombre}?`)) return;
    try {
      await electrolineasApi.eliminar(e.id);
      electrolineras.recargar();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <Encabezado
        titulo="Electrolineras"
        descripcion="Los sitios donde están tus cargadores. Su ubicación aparece en el mapa de la app de los conductores."
      >
        {puedeGestionar && (
          <button className="btn" onClick={() => setDialogo({ tipo: 'nueva' })}>
            <Plus size={18} /> Nueva electrolinera
          </button>
        )}
      </Encabezado>

      <MensajeError>{error ?? electrolineras.error}</MensajeError>

      {lista.length > 0 && <Mapa marcadores={marcadores} alto={340} />}

      {electrolineras.datos && lista.length === 0 && (
        <div className="superficie vacio">
          <h2>Aún no hay electrolineras</h2>
          <p>Crea el sitio, ubícalo en el mapa y después asígnale sus cargadores.</p>
          {puedeGestionar && (
            <button className="btn" onClick={() => setDialogo({ tipo: 'nueva' })}>
              <Plus size={18} /> Nueva electrolinera
            </button>
          )}
        </div>
      )}

      {sinSitio.length > 0 && lista.length > 0 && (
        <div className="aviso-linea">
          <MapPin size={16} aria-hidden="true" /> {sinSitio.length} cargador(es) sin electrolinera:{' '}
          <span className="mono">{sinSitio.map((c) => c.numero_serie).join(', ')}</span>. Asígnalos en Cargadores → Editar.
        </div>
      )}

      <div className="cargadores" style={{ marginTop: 18 }}>
        {lista.map((e) => {
          const suyos = cargadoresDe(e.id);
          return (
            <article className={`cargador ${enfocada === e.id ? 'enfocada' : ''}`} key={e.id}>
              <div className="cargador-cabeza">
                <div style={{ minWidth: 0 }}>
                  <div className="sitio-nombre">{e.nombre}</div>
                  <div className="cargador-lugar">{[e.direccion, e.ciudad].filter(Boolean).join(', ') || 'Sin dirección'}</div>
                  {esAdmin && <div className="cargador-lugar">{nombreEmpresa(e.operador_id)}</div>}
                </div>
                {nombreZona(e.zona_id) && <span className="estado">{nombreZona(e.zona_id)}</span>}
              </div>
              <div className="cargador-datos">
                <div>
                  <div className="dato-etiqueta">Cargadores</div>
                  <div className="dato-valor">{suyos.length ? suyos.map((c) => c.numero_serie).join(', ') : 'Ninguno'}</div>
                </div>
                <div>
                  <div className="dato-etiqueta">Horario</div>
                  <div className="dato-valor">{e.horario || 'Sin definir'}</div>
                </div>
              </div>
              <div className="conexion">
                <MapPin size={15} aria-hidden="true" />
                {e.latitud !== null ? (
                  <span className="mono">
                    {e.latitud}, {e.longitud}
                  </span>
                ) : (
                  <span>Sin ubicar en el mapa: no aparece en la app de los conductores</span>
                )}
              </div>
              {puedeGestionar && (
                <div className="cargador-pie">
                  <button className="btn chico sec" onClick={() => setDialogo({ tipo: 'editar', e })}>
                    <Pencil size={15} /> Editar
                  </button>
                  <button className="btn-icono" onClick={() => eliminar(e)} aria-label={`Eliminar ${e.nombre}`} title="Eliminar">
                    <Trash2 size={17} />
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {dialogo && (
        <Modal
          titulo={dialogo.tipo === 'nueva' ? 'Nueva electrolinera' : `Editar ${dialogo.e.nombre}`}
          descripcion="Haz clic en el mapa (o arrastra el pin) para marcar el sitio exacto."
          alCerrar={() => setDialogo(null)}
        >
          <FormularioElectrolinera
            e={dialogo.tipo === 'editar' ? dialogo.e : null}
            empresas={esAdmin ? operadores.datos ?? [] : null}
            zonas={zonas.datos ?? []}
            alGuardar={() => {
              setDialogo(null);
              electrolineras.recargar();
            }}
          />
        </Modal>
      )}
    </>
  );
}

function FormularioElectrolinera({
  e,
  empresas,
  zonas,
  alGuardar,
}: {
  e: Electrolinera | null;
  empresas: { id: string; nombre: string }[] | null; // null: el usuario es de una empresa
  zonas: { id: string; nombre: string }[];
  alGuardar: () => void;
}) {
  const [f, setF] = useState({
    nombre: e?.nombre ?? '',
    operador_id: e?.operador_id ?? '',
    zona_id: e?.zona_id ?? '',
    direccion: e?.direccion ?? '',
    ciudad: e?.ciudad ?? '',
    horario: e?.horario ?? '24 horas',
    descripcion: e?.descripcion ?? '',
  });
  const [punto, setPunto] = useState<{ lat: number; lng: number } | null>(
    e?.latitud != null && e?.longitud != null ? { lat: e.latitud, lng: e.longitud } : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const cambiar = (campo: keyof typeof f) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF({ ...f, [campo]: ev.target.value });

  // Busca la dirección en OpenStreetMap (Nominatim) para ubicar el pin.
  async function buscarDireccion() {
    setAviso(null);
    const q = [f.direccion, f.ciudad, 'Colombia'].filter(Boolean).join(', ');
    if (!f.direccion && !f.ciudad) return setAviso('Escribe la dirección o la ciudad para buscarla.');
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=co&q=${encodeURIComponent(q)}`, {
        headers: { 'Accept-Language': 'es' },
      });
      const datos = (await r.json()) as { lat: string; lon: string; display_name: string }[];
      if (!datos.length) return setAviso('No encontré esa dirección. Marca el punto haciendo clic en el mapa.');
      setPunto({ lat: Number(Number(datos[0].lat).toFixed(6)), lng: Number(Number(datos[0].lon).toFixed(6)) });
      setAviso(`Ubicado cerca de: ${datos[0].display_name}. Ajusta el pin si hace falta.`);
    } catch {
      setAviso('No se pudo consultar el buscador de direcciones. Marca el punto en el mapa.');
    }
  }

  function miUbicacion() {
    setAviso(null);
    if (!navigator.geolocation) return setAviso('Este navegador no permite leer la ubicación.');
    navigator.geolocation.getCurrentPosition(
      (p) => setPunto({ lat: Number(p.coords.latitude.toFixed(6)), lng: Number(p.coords.longitude.toFixed(6)) }),
      () => setAviso('No se pudo leer la ubicación (el navegador solo la da en HTTPS o si das permiso). Marca el punto en el mapa.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      const datos = {
        ...f,
        zona_id: f.zona_id || null,
        latitud: punto?.lat ?? null,
        longitud: punto?.lng ?? null,
        operador_id: empresas ? f.operador_id : undefined,
      };
      if (e) await electrolineasApi.actualizar(e.id, datos);
      else await electrolineasApi.crear(datos);
      alGuardar();
    } catch (err) {
      setError((err as Error).message);
      setGuardando(false);
    }
  }

  return (
    <form className="formulario dos" onSubmit={onSubmit}>
      <div className="campo ancho-completo">
        <label htmlFor="nombre">Nombre</label>
        <input id="nombre" placeholder="Estación Calle 100" value={f.nombre} onChange={cambiar('nombre')} required />
      </div>
      {empresas && !e && (
        <div className="campo">
          <label htmlFor="empresa">Empresa</label>
          <select id="empresa" value={f.operador_id} onChange={cambiar('operador_id')} required>
            <option value="">Selecciona la empresa</option>
            {empresas.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nombre}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="campo">
        <label htmlFor="zona">Zona</label>
        <select id="zona" value={f.zona_id} onChange={cambiar('zona_id')}>
          <option value="">Sin zona</option>
          {zonas.map((z) => (
            <option key={z.id} value={z.id}>
              {z.nombre}
            </option>
          ))}
        </select>
      </div>
      <div className="campo">
        <label htmlFor="direccion">Dirección</label>
        <input id="direccion" placeholder="Calle 100 # 15-20" value={f.direccion} onChange={cambiar('direccion')} />
      </div>
      <div className="campo">
        <label htmlFor="ciudad">Ciudad</label>
        <input id="ciudad" placeholder="Bogotá" value={f.ciudad} onChange={cambiar('ciudad')} />
      </div>
      <div className="campo">
        <label htmlFor="horario">
          <Clock size={14} aria-hidden="true" /> Horario
        </label>
        <input id="horario" placeholder="24 horas" value={f.horario} onChange={cambiar('horario')} />
      </div>
      <div className="campo">
        <label htmlFor="descripcion">Indicaciones</label>
        <input id="descripcion" placeholder="Sótano 1, junto a la entrada" value={f.descripcion} onChange={cambiar('descripcion')} />
      </div>

      <div className="ancho-completo">
        <div className="acciones" style={{ marginBottom: 10 }}>
          <button type="button" className="btn chico sec" onClick={buscarDireccion}>
            <Search size={15} /> Buscar la dirección
          </button>
          <button type="button" className="btn chico sec" onClick={miUbicacion}>
            <Crosshair size={15} /> Usar mi ubicación
          </button>
          {punto && (
            <button type="button" className="btn chico sec" onClick={() => setPunto(null)}>
              Quitar ubicación
            </button>
          )}
        </div>
        <Mapa punto={punto} alElegir={(lat, lng) => setPunto({ lat, lng })} alto={280} ajustar={false} />
        <div className="secundario" style={{ marginTop: 6 }}>
          {punto ? (
            <span className="mono">
              {punto.lat}, {punto.lng}
            </span>
          ) : (
            'Sin ubicación: haz clic en el mapa para marcarla.'
          )}
        </div>
        {aviso && <div className="secundario">{aviso}</div>}
      </div>

      <div className="ancho-completo">
        <MensajeError>{error}</MensajeError>
      </div>
      <div className="ancho-completo acciones">
        <button className="btn" type="submit" disabled={guardando}>
          {guardando ? 'Guardando…' : e ? 'Guardar cambios' : 'Crear electrolinera'}
        </button>
      </div>
    </form>
  );
}
