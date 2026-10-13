import { useState } from 'react';
import Link from 'next/link';
import { Square } from 'lucide-react';
import { EstadoSesionBadge, Encabezado, MensajeError, useDatos } from '@/components/ui';
import { formatoCOP, formatoFecha, formatoKwh, SesionCarga, sesionesApi } from '@/lib/api';

const FILTROS: { valor: string; texto: string; incluye: (s: SesionCarga) => boolean }[] = [
  { valor: 'todas', texto: 'Todas', incluye: () => true },
  { valor: 'activas', texto: 'Activas', incluye: (s) => ['iniciando', 'en_curso', 'deteniendo'].includes(s.estado) },
  { valor: 'pendientes', texto: 'Pago pendiente', incluye: (s) => s.estado === 'finalizada' && (!s.pago || s.pago.estado_pago === 'pendiente') },
  { valor: 'fallidas', texto: 'Fallidas', incluye: (s) => s.estado === 'fallida' },
];

export default function SesionesPage() {
  const sesiones = useDatos(() => sesionesApi.listar(), 4000);
  const [filtro, setFiltro] = useState('todas');
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function detener(s: SesionCarga) {
    if (!window.confirm(`¿Detener la carga en ${s.numero_serie}?`)) return;
    try {
      await sesionesApi.finalizar(s.id);
      sesiones.recargar();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const criterio = FILTROS.find((f) => f.valor === filtro)!;
  const texto = busqueda.trim().toLowerCase();
  const lista = (sesiones.datos ?? []).filter(
    (s) => criterio.incluye(s) && (!texto || s.numero_serie.toLowerCase().includes(texto) || s.usuario_id.toLowerCase().includes(texto)),
  );

  return (
    <>
      <Encabezado titulo="Sesiones de carga" descripcion="Cargas iniciadas desde el QR o con tarjeta RFID. Se actualiza cada 4 segundos." />

      <MensajeError>{error ?? sesiones.error}</MensajeError>

      <section className="superficie">
        <div className="superficie-titulo" style={{ flexWrap: 'wrap' }}>
          <div className="acciones" role="group" aria-label="Filtrar sesiones">
            {FILTROS.map((f) => (
              <button key={f.valor} className={`btn chico ${filtro === f.valor ? '' : 'sec'}`} onClick={() => setFiltro(f.valor)} aria-pressed={filtro === f.valor}>
                {f.texto}
              </button>
            ))}
          </div>
          <input
            type="search"
            placeholder="Buscar por cargador o usuario"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            style={{ maxWidth: 280 }}
            aria-label="Buscar sesiones"
          />
        </div>

        {lista.length ? (
          <div className="tabla-envoltura">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Inicio</th>
                  <th>Cargador</th>
                  <th>Usuario</th>
                  <th>Estado</th>
                  <th className="num">Energía</th>
                  <th className="num">Valor</th>
                  <th>Pago</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lista.map((s) => (
                  <tr key={s.id}>
                    <td>
                      {formatoFecha(s.inicio)}
                      <div className="secundario">{s.origen === 'rfid' ? 'Tarjeta RFID' : 'App (QR)'}{s.medicion_simulada ? ', medición simulada' : ''}</div>
                    </td>
                    <td className="mono">{s.numero_serie}</td>
                    <td>{s.usuario_id}</td>
                    <td>
                      <EstadoSesionBadge estado={s.estado} />
                      {s.motivo && s.estado === 'fallida' && <div className="secundario">{s.motivo}</div>}
                    </td>
                    <td className="num">
                      {formatoKwh(s.kwh_consumidos)}
                      {s.potencia_kw != null && s.estado === 'en_curso' && <div className="secundario">{s.potencia_kw} kW</div>}
                    </td>
                    <td className="num">
                      {formatoCOP(s.costo_total ?? s.costo_estimado)}
                      {s.costo_total == null && s.estado !== 'fallida' && <div className="secundario">estimado</div>}
                    </td>
                    <td>
                      {s.pago ? (
                        <span className={`estado ${s.pago.estado_pago === 'aprobado' ? 'ok' : s.pago.estado_pago === 'rechazado' ? 'falla' : 'alerta'}`}>
                          {s.pago.estado_pago === 'pendiente' ? 'Pendiente' : s.pago.estado_pago === 'aprobado' ? 'Aprobado' : 'Rechazado'}
                        </span>
                      ) : s.estado === 'finalizada' ? (
                        <span className="estado alerta">Sin pagar</span>
                      ) : (
                        <span className="secundario">—</span>
                      )}
                    </td>
                    <td>
                      <div className="acciones" style={{ flexWrap: 'nowrap' }}>
                        {['en_curso', 'iniciando'].includes(s.estado) && (
                          <button className="btn chico peligro" onClick={() => detener(s)}>
                            <Square size={13} /> Detener
                          </button>
                        )}
                        <Link className="btn chico sec" href={`/carga/${s.id}`} target="_blank">
                          Ver como usuario
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="vacio">
            <h2>{sesiones.datos?.length ? 'Ninguna sesión con este filtro' : 'Aún no hay sesiones'}</h2>
            <p>Abre el QR de un cargador desde la página Cargadores para iniciar una carga de prueba.</p>
          </div>
        )}
      </section>
    </>
  );
}
