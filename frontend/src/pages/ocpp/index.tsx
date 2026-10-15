import { useEffect, useRef, useState } from 'react';
import { CirclePause, RefreshCw, Send } from 'lucide-react';
import { Encabezado, MensajeError, useDatos } from '@/components/ui';
import {
  ComandoOcpp,
  ConexionOcpp,
  haceCuanto,
  MensajeOcpp,
  ocppApi,
  RespuestaComando,
  urlOcpp,
} from '@/lib/api';

const INTERVALO_REGISTRO_MS = 2000;
const MAX_LINEAS = 400;

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-CO', { hour12: false });

export default function ConsolaOcpp() {
  const conexiones = useDatos(() => ocppApi.conexiones(), 4000);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  // El catálogo de comandos depende de la versión OCPP con la que se conectó el cargador.
  const version = conexiones.datos?.find((c) => c.numero_serie === seleccionado)?.version ?? '1.6';
  const catalogo = useDatos(() => ocppApi.catalogo(version), undefined, version);

  const lista = conexiones.datos ?? [];
  const actual = lista.find((c) => c.numero_serie === seleccionado) ?? null;

  // Seleccionar automáticamente el primer cargador conectado.
  useEffect(() => {
    if (!seleccionado && lista.length) setSeleccionado(lista[0].numero_serie);
  }, [lista, seleccionado]);

  return (
    <>
      <Encabezado
        titulo="Consola OCPP"
        descripcion="Mensajes OCPP 1.6J entre la plataforma y los cargadores. Envía comandos y mira la respuesta en vivo."
      />

      <div className="rejilla rejilla-consola">
        <div className="rejilla">
          <section className="superficie">
            <div className="superficie-titulo">
              <div>
                <h2>Conectados</h2>
                <p>
                  Gateway: <code>{urlOcpp()}/&lt;serie&gt;</code>
                </p>
              </div>
            </div>
            <MensajeError>{conexiones.error}</MensajeError>
            {lista.length ? (
              <div className="lista-conexiones">
                {lista.map((c) => (
                  <button
                    key={c.numero_serie}
                    className={`conexion-item ${c.numero_serie === seleccionado ? 'seleccionado' : ''}`}
                    onClick={() => setSeleccionado(c.numero_serie)}
                    aria-pressed={c.numero_serie === seleccionado}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <span className="led encendido" aria-hidden="true" />
                      <span className="mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.numero_serie}</span>
                    </span>
                    <span className="secundario" style={{ color: 'var(--tenue)', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {estadoConector(c)} · {c.version}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="kpi-nota">
                Ningún cargador conectado. En el equipo configura domain_master con la dirección del gateway y pile_number_master con su número de serie.
              </p>
            )}
          </section>

          {actual && <DetalleConexion conexion={actual} />}
        </div>

        <div className="rejilla">
          <section className="superficie">
            <div className="superficie-titulo">
              <div>
                <h2>Enviar comando</h2>
                <p>
                  {actual ? (
                    <>
                      Destino: <code>{actual.numero_serie}</code> · OCPP {actual.version}
                    </>
                  ) : (
                    'Selecciona un cargador conectado'
                  )}
                </p>
              </div>
            </div>
            <PanelComandos key={version} catalogo={catalogo.datos ?? []} destino={actual?.numero_serie ?? null} />
          </section>

          <RegistroMensajes numeroSerie={seleccionado} />
        </div>
      </div>
    </>
  );
}

function estadoConector(c: ConexionOcpp) {
  const principal = c.conectores.find((x) => x.connectorId === 1) ?? c.conectores[0];
  return principal ? principal.status : c.boot_aceptado ? 'Aceptado' : 'Sin BootNotification';
}

function DetalleConexion({ conexion: c }: { conexion: ConexionOcpp }) {
  const filas: [string, string][] = [
    ['Fabricante', c.boot?.chargePointVendor ?? '—'],
    ['Modelo', c.boot?.chargePointModel ?? '—'],
    ['Firmware', c.boot?.firmwareVersion ?? '—'],
    ['BootNotification', c.boot ? (c.boot_aceptado ? 'Aceptado' : 'Rechazado') : 'Pendiente'],
    ['Conectado', haceCuanto(c.conectado_desde)],
    ['Último heartbeat', haceCuanto(c.ultimo_heartbeat)],
    ['IP', c.ip ?? '—'],
    ['Subprotocolo', c.protocolo],
  ];
  return (
    <section className="superficie">
      <div className="superficie-titulo">
        <h2>Detalle</h2>
      </div>
      <table className="tabla">
        <tbody>
          {filas.map(([k, v]) => (
            <tr key={k}>
              <td className="secundario" style={{ paddingLeft: 0 }}>{k}</td>
              <td style={{ textAlign: 'right' }}>{v}</td>
            </tr>
          ))}
          {c.conectores.map((x) => (
            <tr key={x.connectorId}>
              <td className="secundario" style={{ paddingLeft: 0 }}>Conector {x.connectorId}</td>
              <td style={{ textAlign: 'right' }}>
                {x.status}
                {x.errorCode !== 'NoError' && <div style={{ color: 'var(--falla)', fontSize: 12 }}>{x.errorCode}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function PanelComandos({ catalogo, destino }: { catalogo: ComandoOcpp[]; destino: string | null }) {
  const [accion, setAccion] = useState('');
  const [texto, setTexto] = useState('{}');
  const [errorJson, setErrorJson] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [respuesta, setRespuesta] = useState<RespuestaComando | null>(null);
  const [enviando, setEnviando] = useState(false);

  const definicion = catalogo.find((c) => c.accion === accion);

  useEffect(() => {
    if (!accion && catalogo.length) elegir(catalogo[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogo]);

  function elegir(c: ComandoOcpp) {
    setAccion(c.accion);
    setTexto(JSON.stringify(c.plantilla, null, 2));
    setRespuesta(null);
    setError(null);
    setErrorJson(null);
  }

  // Validación local del JSON mientras se escribe; la del esquema OCPP la hace el backend.
  function alEscribir(valor: string) {
    setTexto(valor);
    try {
      const v = JSON.parse(valor);
      setErrorJson(typeof v === 'object' && v !== null && !Array.isArray(v) ? null : 'El payload debe ser un objeto { … }');
    } catch (e) {
      setErrorJson(`JSON inválido: ${(e as Error).message}`);
    }
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!destino || errorJson) return;
    setEnviando(true);
    setError(null);
    setRespuesta(null);
    try {
      setRespuesta(await ocppApi.enviar(destino, accion, JSON.parse(texto)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="formulario" onSubmit={enviar}>
      <div className="formulario dos">
        <div className="campo">
          <label htmlFor="accion">Acción</label>
          <select
            id="accion"
            value={accion}
            onChange={(e) => {
              const c = catalogo.find((x) => x.accion === e.target.value);
              if (c) elegir(c);
            }}
          >
            {catalogo.map((c) => (
              <option key={c.accion} value={c.accion}>
                {c.accion}
              </option>
            ))}
          </select>
        </div>
        <div className="campo" style={{ alignSelf: 'end' }}>
          <span className="ayuda" style={{ fontSize: 13 }}>{definicion?.descripcion}</span>
        </div>
      </div>

      <div className="campo">
        <label htmlFor="payload">Payload (JSON)</label>
        <textarea id="payload" rows={7} value={texto} onChange={(e) => alEscribir(e.target.value)} spellCheck={false} aria-invalid={Boolean(errorJson)} />
        {errorJson && <span className="ayuda" style={{ color: 'var(--falla)' }}>{errorJson}</span>}
      </div>

      <MensajeError>{error}</MensajeError>

      <div className="acciones">
        <button className="btn" type="submit" disabled={!destino || Boolean(errorJson) || enviando}>
          <Send size={16} /> {enviando ? 'Esperando respuesta…' : 'Enviar al cargador'}
        </button>
        {definicion && (
          <button type="button" className="btn sec" onClick={() => elegir(definicion)}>
            Restablecer plantilla
          </button>
        )}
      </div>

      {respuesta && (
        <div className="respuesta-ocpp" aria-live="polite">
          {respuesta.tipo === 'CALLRESULT' ? (
            <span className={`estado ${resultadoPositivo(respuesta.payload) ? 'ok' : 'alerta'}`}>
              Respuesta del cargador{typeof respuesta.payload.status === 'string' ? `: ${respuesta.payload.status}` : ''}
            </span>
          ) : (
            <span className="estado falla">CALLERROR: {respuesta.codigo}</span>
          )}
          <pre>{JSON.stringify(respuesta.tipo === 'CALLRESULT' ? respuesta.payload : respuesta, null, 2)}</pre>
        </div>
      )}
    </form>
  );
}

const resultadoPositivo = (p: Record<string, unknown>) =>
  p.status === undefined || ['Accepted', 'Unlocked', 'Scheduled'].includes(String(p.status));

function RegistroMensajes({ numeroSerie }: { numeroSerie: string | null }) {
  const [mensajes, setMensajes] = useState<MensajeOcpp[]>([]);
  const [pausado, setPausado] = useState(false);
  const [soloSeleccionado, setSoloSeleccionado] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const ultimoId = useRef(0);
  const caja = useRef<HTMLDivElement>(null);

  const filtro = soloSeleccionado ? numeroSerie : null;

  // Reiniciar el registro al cambiar el filtro.
  useEffect(() => {
    ultimoId.current = 0;
    setMensajes([]);
  }, [filtro]);

  useEffect(() => {
    if (pausado) return;
    let vigente = true;
    const traer = async () => {
      try {
        const nuevos = await ocppApi.mensajes({ numero_serie: filtro ?? undefined, despues_de: ultimoId.current, limite: 200 });
        if (!vigente || !nuevos.length) return;
        ultimoId.current = nuevos[nuevos.length - 1].id;
        setMensajes((m) => [...m, ...nuevos].slice(-MAX_LINEAS));
        setError(null);
      } catch (e) {
        if (vigente) setError((e as Error).message);
      }
    };
    traer();
    const id = setInterval(traer, INTERVALO_REGISTRO_MS);
    return () => {
      vigente = false;
      clearInterval(id);
    };
  }, [filtro, pausado]);

  // Mantener el scroll abajo cuando llegan mensajes nuevos, si el usuario ya estaba abajo.
  useEffect(() => {
    const el = caja.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 120) el.scrollTop = el.scrollHeight;
  }, [mensajes]);

  const lineas = mensajes;

  return (
    <section className="superficie">
      <div className="superficie-titulo" style={{ flexWrap: 'wrap' }}>
        <div>
          <h2>Tráfico en vivo</h2>
          <p>
            <span style={{ color: 'var(--flujo)' }}>←</span> del cargador · <span style={{ color: 'var(--voltaje)' }}>→</span> de la plataforma
          </p>
        </div>
        <div className="acciones">
          <label className="interruptor" style={{ alignItems: 'center' }}>
            <input type="checkbox" checked={soloSeleccionado} onChange={(e) => setSoloSeleccionado(e.target.checked)} />
            <span className="texto">Solo el seleccionado</span>
          </label>
          <button className="btn chico sec" onClick={() => setPausado((p) => !p)} aria-pressed={pausado}>
            {pausado ? <RefreshCw size={14} /> : <CirclePause size={14} />} {pausado ? 'Reanudar' : 'Pausar'}
          </button>
          <button className="btn chico sec" onClick={() => setMensajes([])}>
            Limpiar
          </button>
        </div>
      </div>
      <MensajeError>{error}</MensajeError>
      <div className="consola-registro" ref={caja} role="log" aria-live="off">
        {lineas.length === 0 && <div style={{ padding: 16, color: 'var(--tenue)' }}>Esperando mensajes…</div>}
        {lineas.map((m) => (
          <div className="linea-ocpp" key={m.id}>
            <span className="hora">{hora(m.fecha)}</span>
            <span className={`dir ${m.direccion}`} aria-label={m.direccion}>
              {m.direccion === 'entrada' ? '←' : m.direccion === 'salida' ? '→' : '•'}
            </span>
            <div>
              <span className="cabeza">
                {m.accion ?? '—'}
                <span className={`tipo ${m.tipo === 'CALLERROR' ? 'error' : ''}`}>{m.tipo}</span>
                {!filtro && <span className="tipo">{m.numero_serie}</span>}
              </span>
              {m.payload != null && Object.keys(m.payload as object).length > 0 && (
                <pre>{JSON.stringify(m.payload, null, 1)}</pre>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
