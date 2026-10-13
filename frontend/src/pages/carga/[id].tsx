import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { sesionesApi, SesionCarga, formatoCOP, formatoKwh } from '@/lib/api';

const INTERVALO_MS = 3000;

function duracion(desde: string, hasta: number) {
  const seg = Math.max(0, Math.floor((hasta - new Date(desde).getTime()) / 1000));
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  const dos = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${dos(m)}:${dos(s)}` : `${dos(m)}:${dos(s)}`;
}

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });

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

  // Mientras la carga está en curso: consultar la medición y mover el cronómetro.
  const enCurso = sesion?.estado === 'en_curso';
  useEffect(() => {
    if (!enCurso) return;
    const sondeo = setInterval(refrescar, INTERVALO_MS);
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    return () => {
      clearInterval(sondeo);
      clearInterval(reloj);
    };
  }, [enCurso, refrescar]);

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

  // ---------- Carga en curso ----------
  if (sesion.estado === 'en_curso') {
    return (
      <>
        <section className="app-panel app-centro">
          <div className="app-etiqueta">
            <span className="app-pulso" aria-hidden="true" /> Cargando · {sesion.numero_serie}
          </div>
          <div className="app-cifra" aria-live="polite">
            {formatoKwh(sesion.kwh_consumidos)}
          </div>
          <div className="app-texto">Tiempo {duracion(sesion.inicio, ahora)}</div>

          <dl className="app-datos">
            <div>
              <dt>Costo estimado</dt>
              <dd>{formatoCOP(sesion.costo_estimado)}</dd>
            </div>
            <div>
              <dt>Tarifa</dt>
              <dd>{formatoCOP(sesion.tarifa_por_kwh)} / kWh</dd>
            </div>
          </dl>

          {sesion.medicion_simulada && (
            <p className="app-nota">Medición simulada: el cargador aún no reporta consumo por OCPP.</p>
          )}
        </section>

        <button className="app-boton app-boton-peligro" onClick={detener} disabled={ocupado}>
          {ocupado ? 'Deteniendo…' : 'Detener carga'}
        </button>
        {error && <p className="app-error">{error}</p>}
      </>
    );
  }

  // ---------- Carga terminada: resumen, pago y recibo ----------
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
            <dd>{formatoCOP(sesion.tarifa_por_kwh)} / kWh</dd>
          </div>
          <div>
            <dt>Duración</dt>
            <dd>{sesion.fin ? duracion(sesion.inicio, new Date(sesion.fin).getTime()) : '—'}</dd>
          </div>
          <div>
            <dt>Inicio</dt>
            <dd>{fechaHora(sesion.inicio)}</dd>
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
                <span className={`badge ${sesion.pago.estado_pago}`}>{sesion.pago.estado_pago}</span>
              </dd>
            </div>
          )}
        </dl>
      </section>

      {!sesion.pago ? (
        <button className="app-boton" onClick={pagar} disabled={ocupado}>
          {ocupado ? 'Procesando…' : `Pagar ${formatoCOP(total)}`}
        </button>
      ) : (
        sesion.pago.estado_pago === 'pendiente' && (
          <p className="app-nota app-panel">
            Pago registrado como pendiente: la pasarela de pagos (Wompi) aún no está conectada, así
            que todavía no se realizó ningún cobro.
          </p>
        )
      )}

      {error && <p className="app-error">{error}</p>}
      {volverAlCargador}
    </>
  );
}
