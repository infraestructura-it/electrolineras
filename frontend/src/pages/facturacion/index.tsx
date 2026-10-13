import { useState } from 'react';
import { Calculator } from 'lucide-react';
import { Encabezado, MensajeError, useDatos } from '@/components/ui';
import { facturacionApi, formatoCOP, formatoFecha, formatoKwh, RepartoFacturacion, sesionesApi } from '@/lib/api';

export default function FacturacionPage() {
  const sesiones = useDatos(() => sesionesApi.listar(), 10000);
  const pagadas = (sesiones.datos ?? []).filter((s) => s.pago);

  const totales = pagadas.reduce(
    (t, s) => ({
      cobrado: t.cobrado + (s.pago?.monto_total ?? 0),
      comision: t.comision + (s.pago?.comision_plataforma ?? 0),
      operador: t.operador + (s.pago?.monto_operador ?? 0),
    }),
    { cobrado: 0, comision: 0, operador: 0 },
  );

  return (
    <>
      <Encabezado
        titulo="Facturación"
        descripcion="Cobros de cada carga y su reparto entre la plataforma y el operador. Los pagos quedan pendientes hasta conectar Wompi."
      />

      <section className="kpis" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }} aria-label="Totales">
        <div className="kpi">
          <div>
            <div className="kpi-etiqueta">Total cobrado</div>
            <div className="kpi-valor">{formatoCOP(totales.cobrado)}</div>
          </div>
        </div>
        <div className="kpi">
          <div>
            <div className="kpi-etiqueta">Comisión de la plataforma</div>
            <div className="kpi-valor">{formatoCOP(totales.comision)}</div>
          </div>
        </div>
        <div className="kpi">
          <div>
            <div className="kpi-etiqueta">Para los operadores</div>
            <div className="kpi-valor">{formatoCOP(totales.operador)}</div>
          </div>
        </div>
      </section>

      <div className="rejilla rejilla-lateral">
        <section className="superficie">
          <div className="superficie-titulo">
            <h2>Pagos registrados</h2>
          </div>
          <MensajeError>{sesiones.error}</MensajeError>
          {pagadas.length ? (
            <div className="tabla-envoltura">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Cargador</th>
                    <th className="num">Energía</th>
                    <th className="num">Cobrado</th>
                    <th className="num">Comisión</th>
                    <th className="num">Operador</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {pagadas.map((s) => (
                    <tr key={s.id}>
                      <td>{formatoFecha(s.pago!.fecha)}</td>
                      <td className="mono">{s.numero_serie}</td>
                      <td className="num">{formatoKwh(s.kwh_consumidos)}</td>
                      <td className="num">{formatoCOP(s.pago!.monto_total)}</td>
                      <td className="num">
                        {formatoCOP(s.pago!.comision_plataforma)}
                        <div className="secundario">{s.pago!.porcentaje_comision} %</div>
                      </td>
                      <td className="num">{formatoCOP(s.pago!.monto_operador)}</td>
                      <td>
                        <span className={`estado ${s.pago!.estado_pago === 'aprobado' ? 'ok' : 'alerta'}`}>
                          {s.pago!.estado_pago === 'aprobado' ? 'Aprobado' : 'Pendiente'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="kpi-nota">Cuando un usuario pague una carga desde la app, el reparto aparecerá aquí.</p>
          )}
        </section>

        <section className="superficie">
          <div className="superficie-titulo">
            <div>
              <h2>Simular un cobro</h2>
              <p>Calcula el reparto antes de pactar una comisión.</p>
            </div>
          </div>
          <Simulador />
        </section>
      </div>
    </>
  );
}

function Simulador() {
  const [monto, setMonto] = useState('');
  const [comision, setComision] = useState('');
  const [resultado, setResultado] = useState<RepartoFacturacion | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setResultado(
        await facturacionApi.cobrar({
          monto_total: Number(monto),
          comision_pactada: comision ? Number(comision) : null,
          cuenta_beneficiario: 'simulacion',
        }),
      );
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <form className="formulario" onSubmit={onSubmit}>
      <div className="campo">
        <label htmlFor="monto">Valor de la carga (COP)</label>
        <input id="monto" type="number" min="1" step="1" placeholder="45000" value={monto} onChange={(e) => setMonto(e.target.value)} required />
      </div>
      <div className="campo">
        <label htmlFor="comision">Comisión (%)</label>
        <input id="comision" type="number" min="0" max="100" step="0.01" placeholder="Vacío = la de Configuración" value={comision} onChange={(e) => setComision(e.target.value)} />
      </div>
      <MensajeError>{error}</MensajeError>
      <button className="btn" type="submit">
        <Calculator size={17} /> Calcular reparto
      </button>
      {resultado && (
        <dl className="app-recibo" style={{ margin: 0 }}>
          <div>
            <dt>Comisión ({resultado.porcentaje_comision} %)</dt>
            <dd>{formatoCOP(resultado.comision_plataforma)}</dd>
          </div>
          <div>
            <dt>Para el operador</dt>
            <dd>{formatoCOP(resultado.monto_operador)}</dd>
          </div>
        </dl>
      )}
    </form>
  );
}
