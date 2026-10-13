import { useEffect, useState } from 'react';
import Link from 'next/link';
import { sesionesApi, SesionCarga, formatoCOP, formatoKwh } from '@/lib/api';

const INTERVALO_MS = 5000;

export default function SesionesPage() {
  const [sesiones, setSesiones] = useState<SesionCarga[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    try {
      setSesiones(await sesionesApi.listar());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    cargar();
    const sondeo = setInterval(cargar, INTERVALO_MS);
    return () => clearInterval(sondeo);
  }, []);

  async function finalizar(s: SesionCarga) {
    if (!window.confirm(`¿Finalizar la carga en ${s.numero_serie}?`)) return;
    try {
      await sesionesApi.finalizar(s.id);
      await cargar();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const enCurso = sesiones.filter((s) => s.estado === 'en_curso').length;

  return (
    <>
      <h1>Sesiones de carga</h1>
      <p>
        Cargas iniciadas por los usuarios desde el QR del cargador. Se actualiza cada{' '}
        {INTERVALO_MS / 1000} s · {enCurso} en curso.
      </p>

      {error && <p className="error">{error}</p>}

      {sesiones.map((s) => (
        <div className="card" key={s.id}>
          <div className="card-title">
            {s.numero_serie} <span className={`badge ${s.estado}`}>{s.estado}</span>{' '}
            {s.pago && <span className={`badge ${s.pago.estado_pago}`}>pago {s.pago.estado_pago}</span>}
          </div>
          <div className="card-meta">
            {s.usuario_id} · {new Date(s.inicio).toLocaleString('es-CO')} · {formatoKwh(s.kwh_consumidos)} ·{' '}
            {formatoCOP(s.costo_total ?? s.costo_estimado)}
            {s.estado === 'en_curso' && ' (estimado)'}
          </div>
          {s.pago && (
            <div className="card-meta">
              Comisión plataforma {formatoCOP(s.pago.comision_plataforma)} · Operador{' '}
              {formatoCOP(s.pago.monto_operador)}
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, marginTop: 10, alignItems: 'center' }}>
            {s.estado === 'en_curso' && (
              <button type="button" onClick={() => finalizar(s)}>
                Finalizar
              </button>
            )}
            <Link href={`/carga/${s.id}`} style={{ color: 'var(--accent)', fontSize: 13 }}>
              Ver como usuario
            </Link>
          </div>
        </div>
      ))}

      {sesiones.length === 0 && !error && (
        <p className="card-meta">
          Aún no hay sesiones. Abre la URL del QR de un cargador (en Cargadores) para iniciar una.
        </p>
      )}
    </>
  );
}
