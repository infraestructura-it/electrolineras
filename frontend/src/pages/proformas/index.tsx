import { useState } from 'react';
import Link from 'next/link';
import { FileText, Search } from 'lucide-react';
import { Encabezado, MensajeError, useDatos } from '@/components/ui';
import { formatoCOP, formatoFecha, proformasApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const ESTADOS = [
  { valor: '', texto: 'Todas' },
  { valor: 'vigente', texto: 'Vigentes' },
  { valor: 'anulada', texto: 'Anuladas' },
];

export default function ProformasPage() {
  const { esAdmin } = useAuth();
  const [estado, setEstado] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [consulta, setConsulta] = useState('');
  const proformas = useDatos(() => proformasApi.listar({ estado, q: consulta }), 15000, `${estado}|${consulta}`);

  const lista = proformas.datos ?? [];
  const vigentes = lista.filter((p) => p.estado === 'vigente');
  const totalVigente = vigentes.reduce((t, p) => t + p.total, 0);

  return (
    <>
      <Encabezado
        titulo="Proformas"
        descripcion="Prefacturas con consecutivo y QR de verificación. Se emiten solas cuando el usuario paga en la app, o desde Sesiones con los datos del cliente."
      />

      <section className="kpis" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }} aria-label="Resumen">
        <div className="kpi">
          <span className="kpi-icono voltaje"><FileText size={20} /></span>
          <div>
            <div className="kpi-etiqueta">Proformas en la lista</div>
            <div className="kpi-valor">{lista.length}</div>
          </div>
        </div>
        <div className="kpi">
          <div>
            <div className="kpi-etiqueta">Vigentes</div>
            <div className="kpi-valor">{vigentes.length}</div>
          </div>
        </div>
        <div className="kpi">
          <div>
            <div className="kpi-etiqueta">Valor vigente</div>
            <div className="kpi-valor">{formatoCOP(totalVigente)}</div>
          </div>
        </div>
      </section>

      <MensajeError>{proformas.error}</MensajeError>

      <section className="superficie">
        <div className="superficie-titulo" style={{ flexWrap: 'wrap' }}>
          <div className="acciones" role="group" aria-label="Filtrar por estado">
            {ESTADOS.map((e) => (
              <button key={e.valor} className={`btn chico ${estado === e.valor ? '' : 'sec'}`} onClick={() => setEstado(e.valor)} aria-pressed={estado === e.valor}>
                {e.texto}
              </button>
            ))}
          </div>
          <form
            className="acciones"
            onSubmit={(e) => {
              e.preventDefault();
              setConsulta(busqueda);
            }}
          >
            <input
              id="buscar-proforma"
              type="search"
              placeholder="Número, cliente, NIT o cargador"
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                if (!e.target.value) setConsulta('');
              }}
              style={{ width: 260 }}
              aria-label="Buscar proformas"
            />
            <button className="btn chico sec" type="submit">
              <Search size={14} /> Buscar
            </button>
          </form>
        </div>

        {lista.length ? (
          <div className="tabla-envoltura">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Cargador</th>
                  {esAdmin && <th>Operador</th>}
                  <th className="num">Total</th>
                  <th className="num">Neto</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lista.map((p) => (
                  <tr key={p.id}>
                    <td className="mono" style={{ fontWeight: 600 }}>{p.numero}</td>
                    <td>
                      {formatoFecha(p.fecha_emision)}
                      <div className="secundario">{p.origen === 'automatica' ? 'Al pagar en la app' : 'Desde el panel'}</div>
                    </td>
                    <td>
                      {p.cliente.nombre}
                      <div className="secundario">{p.cliente.documento}</div>
                    </td>
                    <td className="mono">{p.numero_serie}</td>
                    {esAdmin && <td>{p.operador}</td>}
                    <td className="num">{formatoCOP(p.total)}</td>
                    <td className="num">{formatoCOP(p.total_neto)}</td>
                    <td>
                      <span className={`estado ${p.estado === 'vigente' ? 'ok' : 'falla'}`}>{p.estado === 'vigente' ? 'Vigente' : 'Anulada'}</span>
                    </td>
                    <td>
                      <Link className="btn chico sec" href={`/proformas/${p.id}`}>
                        <FileText size={14} /> Ver
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="vacio">
            <h2>{proformas.datos && (estado || consulta) ? 'Ninguna proforma con este filtro' : 'Aún no hay proformas'}</h2>
            <p>Se emiten al pagar una carga en la app, o desde Sesiones de carga con el botón Proforma.</p>
          </div>
        )}
      </section>
    </>
  );
}
