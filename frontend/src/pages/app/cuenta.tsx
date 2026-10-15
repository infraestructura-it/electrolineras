import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { Gift, LogOut, PiggyBank } from 'lucide-react';
import { conductorApi, Conductor, formatoCOP, formatoFecha, formatoKwh, ResumenPuntos, SesionCarga } from '@/lib/api';

const TIPO = { acumulacion: 'Ganados', redencion: 'Usados', reverso: 'Devueltos' } as const;
const ESTADO: Record<SesionCarga['estado'], string> = {
  iniciando: 'Iniciando',
  en_curso: 'En curso',
  deteniendo: 'Deteniendo',
  finalizada: 'Finalizada',
  fallida: 'No inició',
};

// Cuenta del conductor: saldo de puntos por empresa, ahorro, movimientos e historial de cargas.
export default function CuentaConductor() {
  const router = useRouter();
  const [yo, setYo] = useState<Conductor | null>(null);
  const [puntos, setPuntos] = useState<ResumenPuntos | null>(null);
  const [cargas, setCargas] = useState<SesionCarga[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!conductorApi.hayCuenta()) {
      router.replace('/app/entrar');
      return;
    }
    Promise.all([conductorApi.yo(), conductorApi.puntos(), conductorApi.cargas()])
      .then(([c, p, s]) => {
        setYo(c);
        setPuntos(p);
        setCargas(s);
      })
      .catch((e: Error) => {
        if (!conductorApi.hayCuenta()) router.replace('/app/entrar'); // token vencido
        else setError(e.message);
      });
  }, [router]);

  function salir() {
    conductorApi.salir();
    router.replace('/app');
  }

  if (error) return <p className="app-error">{error}</p>;
  if (!yo || !puntos) return <p className="app-texto app-centro">Cargando tu cuenta…</p>;

  const finalizadas = cargas.filter((c) => c.estado === 'finalizada');
  const kwh = finalizadas.reduce((t, c) => t + c.kwh_consumidos, 0);

  return (
    <>
      <section className="app-panel app-centro">
        <div className="app-etiqueta">Hola, {yo.nombre}</div>
        <div className="app-cifra">{puntos.saldo_total.toLocaleString('es-CO')}</div>
        <div className="anillo-unidad">puntos disponibles · equivalen a {formatoCOP(puntos.valor_total_cop)}</div>
        <dl className="app-datos">
          <div>
            <dt>Cargas</dt>
            <dd>{finalizadas.length}</dd>
          </div>
          <div>
            <dt>Energía</dt>
            <dd>{formatoKwh(kwh)}</dd>
          </div>
          <div>
            <dt>Ahorro con puntos</dt>
            <dd>{formatoCOP(puntos.ahorro_cop)}</dd>
          </div>
        </dl>
      </section>

      {puntos.empresas.length > 0 && (
        <section className="app-panel">
          <h2 className="app-subtitulo">
            <Gift size={16} aria-hidden="true" /> Puntos por empresa
          </h2>
          <p className="app-nota">Los puntos se usan en los cargadores de la empresa que los otorgó.</p>
          <dl className="app-recibo">
            {puntos.empresas.map((e) => (
              <div key={e.operador_id}>
                <dt>
                  {e.operador_nombre}
                  {!e.programa_activo && ' (programa pausado)'}
                </dt>
                <dd>
                  <strong>{e.saldo}</strong> pts · {formatoCOP(e.valor_cop)}
                  {e.saldo < e.minimo_canje && <span className="app-nota"> · se redimen desde {e.minimo_canje}</span>}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section className="app-panel">
        <h2 className="app-subtitulo">
          <PiggyBank size={16} aria-hidden="true" /> Movimientos de puntos
        </h2>
        {puntos.movimientos.length === 0 ? (
          <p className="app-texto">Aún no tienes movimientos. Carga con tu cuenta abierta para empezar a sumar.</p>
        ) : (
          <dl className="app-recibo">
            {puntos.movimientos.slice(0, 20).map((m) => (
              <div key={m.id}>
                <dt>
                  {TIPO[m.tipo]} · {m.operador_nombre}
                  <br />
                  <span className="app-nota">
                    {formatoFecha(m.fecha)} · {m.detalle}
                  </span>
                </dt>
                <dd className={`sin-corte ${m.puntos > 0 ? 'texto-flujo' : ''}`}>
                  {m.puntos > 0 ? '+' : ''}
                  {m.puntos}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section className="app-panel">
        <h2 className="app-subtitulo">Mis cargas</h2>
        {cargas.length === 0 ? (
          <p className="app-texto">
            Aún no has cargado con tu cuenta. <Link href="/app">Busca una electrolinera</Link>.
          </p>
        ) : (
          <ul className="app-sitio-cargadores">
            {cargas.slice(0, 20).map((c) => (
              <li key={c.id}>
                <Link href={`/carga/${c.id}`}>
                  <span>
                    <strong>
                      {formatoKwh(c.kwh_consumidos)} · {formatoCOP(c.pago?.monto_total ?? c.costo_total ?? c.costo_estimado)}
                    </strong>
                    <span className="app-nota">
                      {formatoFecha(c.inicio)} · {c.numero_serie}
                      {c.puntos_ganados ? ` · +${c.puntos_ganados} pts` : ''}
                    </span>
                  </span>
                  <span className={`estado ${c.estado === 'finalizada' ? (c.pago ? 'ok' : 'alerta') : c.estado === 'fallida' ? 'falla' : ''}`}>
                    {c.estado === 'finalizada' ? (c.pago ? (c.pago.estado_pago === 'aprobado' ? 'Pagada' : 'Pago registrado') : 'Por pagar') : ESTADO[c.estado]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <button className="btn sec app-boton" onClick={salir}>
        <LogOut size={16} aria-hidden="true" /> Cerrar sesión
      </button>
    </>
  );
}
