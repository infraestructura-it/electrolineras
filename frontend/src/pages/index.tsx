import { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { BatteryCharging, Gauge, PlugZap, Wallet } from 'lucide-react';
import { EstadoSesionBadge, Encabezado, MensajeError, useDatos } from '@/components/ui';
import {
  cargadoresApi,
  estadisticasApi,
  formatoCOP,
  formatoKwh,
  ocppApi,
  sesionesApi,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';

// Recharts mide el contenedor en el navegador: se carga solo en el cliente.
const GraficoEnergia = dynamic(() => import('@/components/Graficos').then((m) => m.GraficoEnergia), { ssr: false });
const GraficoIngresos = dynamic(() => import('@/components/Graficos').then((m) => m.GraficoIngresos), { ssr: false });

const RANGOS = [7, 14, 30];

export default function Inicio() {
  const { usuario, esAdmin } = useAuth();
  const [dias, setDias] = useState(14);
  const estadisticas = useDatos(() => estadisticasApi.obtener(dias), 15000, dias);
  const cargadores = useDatos(() => cargadoresApi.listar(), 15000);
  const conexiones = useDatos(() => ocppApi.conexiones(), 10000);
  const sesiones = useDatos(() => sesionesApi.listar(), 5000);

  const e = estadisticas.datos;
  const totalCargadores = cargadores.datos?.length ?? 0;
  const conectados = conexiones.datos?.filter((c) => c.registrado).length ?? 0;
  const activas = (sesiones.datos ?? []).filter((s) => ['iniciando', 'en_curso', 'deteniendo'].includes(s.estado));
  const recientes = (sesiones.datos ?? []).slice(0, 6);
  const sinDatos = e && e.totales.sesiones === 0;

  return (
    <>
      <Encabezado
        titulo={`Hola, ${usuario?.nombre.split(' ')[0] ?? ''}`}
        descripcion={esAdmin ? 'Así va la red de cargadores de la plataforma.' : 'Así van tus cargadores.'}
      >
        <div className="acciones" role="group" aria-label="Rango de días">
          {RANGOS.map((n) => (
            <button key={n} className={`btn chico ${n === dias ? '' : 'sec'}`} onClick={() => setDias(n)} aria-pressed={n === dias}>
              {n} días
            </button>
          ))}
        </div>
      </Encabezado>

      <MensajeError>{estadisticas.error}</MensajeError>

      <section className="kpis" aria-label="Resumen">
        <div className="kpi">
          <span className="kpi-icono voltaje"><Gauge size={20} /></span>
          <div>
            <div className="kpi-etiqueta">Energía entregada</div>
            <div className="kpi-valor">{e ? formatoKwh(e.totales.kwh) : '—'}</div>
            <div className="kpi-nota">Todas las cargas finalizadas</div>
          </div>
        </div>
        <div className="kpi">
          <span className="kpi-icono flujo"><Wallet size={20} /></span>
          <div>
            <div className="kpi-etiqueta">Ingresos</div>
            <div className="kpi-valor">{e ? formatoCOP(e.totales.ingresos) : '—'}</div>
            <div className="kpi-nota">{e ? `${e.totales.pagos_pendientes} pagos pendientes` : ''}</div>
          </div>
        </div>
        <div className="kpi">
          <span className="kpi-icono neutro"><BatteryCharging size={20} /></span>
          <div>
            <div className="kpi-etiqueta">Sesiones</div>
            <div className="kpi-valor">{e ? e.totales.sesiones : '—'}</div>
            <div className="kpi-nota">{e ? `${e.totales.en_curso} en curso ahora` : ''}</div>
          </div>
        </div>
        <div className="kpi">
          <span className="kpi-icono neutro"><PlugZap size={20} /></span>
          <div>
            <div className="kpi-etiqueta">Conectados por OCPP</div>
            <div className="kpi-valor">
              {conectados} <span style={{ color: 'var(--tenue)', fontSize: 16, fontWeight: 500 }}>de {totalCargadores}</span>
            </div>
            <div className="kpi-nota">Cargadores registrados</div>
          </div>
        </div>
      </section>

      {totalCargadores === 0 && cargadores.datos && (
        <div className="superficie vacio" style={{ marginBottom: 18 }}>
          <h2>Registra tu primer cargador</h2>
          <p>Con el cargador registrado obtienes su código QR y la dirección OCPP para configurarlo.</p>
          <Link className="btn" href="/cargadores">
            <PlugZap size={18} /> Registrar cargador
          </Link>
        </div>
      )}

      <div className="rejilla rejilla-2">
        <section className="superficie">
          <div className="superficie-titulo">
            <div>
              <h2>Energía por día</h2>
              <p>kWh entregados en los últimos {dias} días</p>
            </div>
          </div>
          {e && !sinDatos && <GraficoEnergia datos={e.por_dia} />}
          {sinDatos && <div className="vacio">Aún no hay cargas finalizadas. Cuando haya, verás aquí la energía de cada día.</div>}
        </section>
        <section className="superficie">
          <div className="superficie-titulo">
            <div>
              <h2>Ingresos por día</h2>
              <p>Pesos cobrados en los últimos {dias} días</p>
            </div>
          </div>
          {e && !sinDatos && <GraficoIngresos datos={e.por_dia} />}
          {sinDatos && <div className="vacio">Los ingresos aparecerán cuando se cobre la primera carga.</div>}
        </section>
      </div>

      <div className="rejilla rejilla-lateral">
        <section className="superficie">
          <div className="superficie-titulo">
            <div>
              <h2>Últimas sesiones</h2>
              <p>{activas.length ? `${activas.length} cargando en este momento` : 'Ninguna carga activa en este momento'}</p>
            </div>
            <Link className="btn chico sec" href="/sesiones">Ver todas</Link>
          </div>
          {recientes.length ? (
            <div className="tabla-envoltura">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Cargador</th>
                    <th>Usuario</th>
                    <th>Estado</th>
                    <th className="num">Energía</th>
                    <th className="num">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {recientes.map((s) => (
                    <tr key={s.id}>
                      <td className="mono">{s.numero_serie}</td>
                      <td>{s.usuario_id}</td>
                      <td><EstadoSesionBadge estado={s.estado} /></td>
                      <td className="num">{formatoKwh(s.kwh_consumidos)}</td>
                      <td className="num">{formatoCOP(s.costo_total ?? s.costo_estimado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="kpi-nota">Cuando un usuario escanee el QR de un cargador e inicie una carga, aparecerá aquí.</p>
          )}
        </section>

        <section className="superficie">
          <div className="superficie-titulo">
            <div>
              <h2>Por cargador</h2>
              <p>Energía e ingresos acumulados</p>
            </div>
          </div>
          {e?.por_cargador.length ? (
            <table className="tabla">
              <thead>
                <tr>
                  <th>Cargador</th>
                  <th className="num">kWh</th>
                  <th className="num">Ingresos</th>
                </tr>
              </thead>
              <tbody>
                {e.por_cargador.map((c) => (
                  <tr key={c.numero_serie}>
                    <td className="mono">{c.numero_serie}</td>
                    <td className="num">{c.kwh.toLocaleString('es-CO', { maximumFractionDigits: 1 })}</td>
                    <td className="num">{formatoCOP(c.ingresos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="kpi-nota">Sin cargas finalizadas todavía.</p>
          )}
        </section>
      </div>
    </>
  );
}
