import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { sesionesApi, SesionCarga, formatoCOP, formatoKwh, formatoFecha } from '@/lib/api';

const INTERVALO_MS = 3000;
const POTENCIA_NOMINAL_KW = 30; // MDXDC3001
const RADIO = 92;
const CIRCUNFERENCIA = 2 * Math.PI * RADIO;

function duracion(desde: string, hasta: number) {
  const seg = Math.max(0, Math.floor((hasta - new Date(desde).getTime()) / 1000));
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  const dos = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${dos(m)}:${dos(s)}` : `${dos(m)}:${dos(s)}`;
}

// Anillo de potencia: qué tanto de los 30 kW nominales está entregando el cargador ahora.
function AnilloPotencia({ potenciaKw, children }: { potenciaKw: number | null; children: React.ReactNode }) {
  const fraccion = Math.min(Math.max((potenciaKw ?? 0) / POTENCIA_NOMINAL_KW, 0), 1);
  return (
    <div className="anillo">
      <svg viewBox="0 0 210 210" aria-hidden="true">
        <circle className="pista" cx="105" cy="105" r={RADIO} fill="none" strokeWidth="12" />
        <circle
          className="avance"
          cx="105"
          cy="105"
          r={RADIO}
          fill="none"
          strokeWidth="12"
          strokeDasharray={CIRCUNFERENCIA}
          strokeDashoffset={CIRCUNFERENCIA * (1 - fraccion)}
        />
      </svg>
      <div className="centro">{children}</div>
    </div>
  );
}

export default function CargaEnCurso() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : null;

  const [sesion, setSesion] = useState<SesionCarga | null>(null);
  const [ahora, setAhora] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const refrescar = useCallback(async () => {
    if (!id) return;
    try {
      setSesion(await sesionesApi.obtener(id));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    refrescar();
  }, [refrescar]);

  // Mientras la carga está activa: consultar la medición y mover el cronómetro.
  const activa = sesion ? ['iniciando', 'en_curso', 'deteniendo'].includes(sesion.estado) : false;
  useEffect(() => {
    if (!activa) return;
    const sondeo = setInterval(refrescar, INTERVALO_MS);
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    return () => {
      clearInterval(sondeo);
      clearInterval(reloj);
    };
  }, [activa, refrescar]);

  async function detener() {
    if (!sesion || !window.confirm('¿Detener la carga ahora?')) return;
    setOcupado(true);
    try {
      setSesion(await sesionesApi.finalizar(sesion.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  async function pagar() {
    if (!sesion) return;
    setOcupado(true);
    try {
      setSesion(await sesionesApi.pagar(sesion.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  if (!sesion) {
    return error ? (
      <div className="app-panel app-centro">
        <h1 className="app-titulo">No encontramos esta carga</h1>
        <p className="app-texto">{error}</p>
      </div>
    ) : (
      <p className="app-texto app-centro">Cargando…</p>
    );
  }

  const volverAlCargador = (
    <Link className="app-enlace" href={`/c/${encodeURIComponent(sesion.numero_serie)}`}>
      Volver al cargador {sesion.numero_serie}
    </Link>
  );

  // ---------- Esperando que el cargador arranque ----------
  if (sesion.estado === 'iniciando') {
    return (
      <>
        <section className="app-panel app-centro">
          <div className="app-etiqueta">
            <span className="app-pulso" aria-hidden="true" /> Esperando al cargador {sesion.numero_serie}
          </div>
          <h1 className="app-titulo" style={{ marginTop: 14 }}>Conecta la pistola a tu vehículo</h1>
          <p className="app-texto">La carga empieza sola en cuanto el cargador detecte tu vehículo. Esta pantalla se actualiza sola.</p>
        </section>
        <button className="btn sec app-boton" onClick={detener} disabled={ocupado}>
          Cancelar
        </button>
        {error && <p className="app-error">{error}</p>}
      </>
    );
  }

  // ---------- Carga en curso o deteniéndose ----------
  if (sesion.estado === 'en_curso' || sesion.estado === 'deteniendo') {
    const deteniendo = sesion.estado === 'deteniendo';
    return (
      <>
        <section className="app-panel app-centro">
          <div className="app-etiqueta">
            <span className="app-pulso" aria-hidden="true" /> {deteniendo ? 'Deteniendo' : 'Cargando'} en {sesion.numero_serie}
          </div>

          <AnilloPotencia potenciaKw={deteniendo ? 0 : sesion.potencia_kw}>
            <div className="app-cifra" aria-live="polite">
              {sesion.kwh_consumidos.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="anillo-unidad">kWh entregados</div>
            <div className="app-texto">{sesion.potencia_kw != null && !deteniendo ? `${sesion.potencia_kw} kW` : 'Sin potencia'}</div>
          </AnilloPotencia>

          <dl className="app-datos">
            <div>
              <dt>Tiempo</dt>
              <dd>{duracion(sesion.inicio, ahora)}</dd>
            </div>
            <div>
              <dt>Costo estimado</dt>
              <dd>{formatoCOP(sesion.costo_estimado)}</dd>
            </div>
            <div>
              <dt>Tarifa</dt>
              <dd>{formatoCOP(sesion.tarifa_por_kwh)}/kWh</dd>
            </div>
          </dl>

          {sesion.medicion_simulada && (
            <p className="app-nota">Medición simulada: este cargador aún no reporta consumo por OCPP.</p>
          )}
        </section>

        <button className="btn app-boton app-boton-peligro" onClick={detener} disabled={ocupado || deteniendo}>
          {deteniendo ? 'Esperando la lectura final del cargador…' : ocupado ? 'Deteniendo…' : 'Detener carga'}
        </button>
        {error && <p className="app-error">{error}</p>}
      </>
    );
  }

  // ---------- Falló ----------
  if (sesion.estado === 'fallida') {
    return (
      <>
        <section className="app-panel app-centro">
          <span className="estado falla">No se pudo cargar</span>
          <h1 className="app-titulo" style={{ marginTop: 12 }}>La carga no empezó</h1>
          <p className="app-texto">{sesion.motivo ?? 'El cargador no respondió.'} No se te cobró nada.</p>
        </section>
        <Link className="btn app-boton" href={`/c/${encodeURIComponent(sesion.numero_serie)}`}>
          Intentar de nuevo
        </Link>
      </>
    );
  }

  // ---------- Finalizada: resumen, pago y recibo ----------
  const total = sesion.costo_total ?? 0;
  return (
    <>
      <section className="app-panel">
        <div className="app-etiqueta">{sesion.pago ? 'Recibo' : 'Carga finalizada'}</div>
        <div className="app-cifra">{formatoCOP(total)}</div>

        <dl className="app-recibo">
          <div>
            <dt>Energía entregada</dt>
            <dd>{formatoKwh(sesion.kwh_consumidos)}</dd>
          </div>
          <div>
            <dt>Tarifa</dt>
            <dd>{formatoCOP(sesion.tarifa_por_kwh)} por kWh</dd>
          </div>
          <div>
            <dt>Duración</dt>
            <dd>{sesion.fin ? duracion(sesion.inicio, new Date(sesion.fin).getTime()) : '—'}</dd>
          </div>
          <div>
            <dt>Inicio</dt>
            <dd>{formatoFecha(sesion.inicio)}</dd>
          </div>
          <div>
            <dt>Cargador</dt>
            <dd>{sesion.numero_serie}</dd>
          </div>
          <div>
            <dt>Recibo para</dt>
            <dd>{sesion.usuario_id}</dd>
          </div>
          {sesion.pago && (
            <div>
              <dt>Pago</dt>
              <dd>
                <span className={`estado ${sesion.pago.estado_pago === 'aprobado' ? 'ok' : 'alerta'}`}>
                  {sesion.pago.estado_pago === 'aprobado' ? 'Aprobado' : 'Pendiente'}
                </span>
              </dd>
            </div>
          )}
        </dl>
      </section>

      {!sesion.pago ? (
        <button className="btn app-boton" onClick={pagar} disabled={ocupado}>
          {ocupado ? 'Procesando…' : `Pagar ${formatoCOP(total)}`}
        </button>
      ) : (
        sesion.pago.estado_pago === 'pendiente' && (
          <p className="app-nota app-panel">
            Pago registrado como pendiente: la pasarela de pagos (Wompi) aún no está conectada, así que todavía no se
            realizó ningún cobro.
          </p>
        )
      )}

      {sesion.proforma && sesion.proforma.estado === 'vigente' && (
        <Link className="btn sec app-boton" href={`/p/${sesion.proforma.codigo_verificacion}`}>
          Ver proforma {sesion.proforma.numero}
        </Link>
      )}

      {error && <p className="app-error">{error}</p>}
      {volverAlCargador}
    </>
  );
}
