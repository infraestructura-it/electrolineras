import { useState } from 'react';
import { facturacionApi, RepartoFacturacion } from '@/lib/api';

export default function FacturacionPage() {
  const [montoTotal, setMontoTotal] = useState('');
  const [comisionPactada, setComisionPactada] = useState('');
  const [cuentaBeneficiario, setCuentaBeneficiario] = useState('');
  const [resultado, setResultado] = useState<RepartoFacturacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    try {
      const res = await facturacionApi.cobrar({
        monto_total: Number(montoTotal),
        comision_pactada: comisionPactada ? Number(comisionPactada) : null,
        cuenta_beneficiario: cuentaBeneficiario,
      });
      setResultado(res);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <>
      <h1>Facturación</h1>
      <p>
        Calcula el cobro al usuario final y el reparto entre la comisión de la plataforma y
        el operador. La integración real con Wompi (cobro + dispersión de pagos) está
        pendiente — por ahora esto refleja el cálculo que hará el backend.
      </p>

      <form onSubmit={onSubmit}>
        <label htmlFor="monto">Monto total de la sesión ($)</label>
        <input id="monto" type="number" step="0.01" value={montoTotal} onChange={(e) => setMontoTotal(e.target.value)} required />

        <label htmlFor="comision">Comisión pactada con el operador (%, opcional)</label>
        <input
          id="comision"
          type="number"
          step="0.01"
          placeholder="Si se deja vacío, usa el 20% por defecto"
          value={comisionPactada}
          onChange={(e) => setComisionPactada(e.target.value)}
        />

        <label htmlFor="cuenta">Cuenta beneficiaria del operador</label>
        <input id="cuenta" value={cuentaBeneficiario} onChange={(e) => setCuentaBeneficiario(e.target.value)} required />

        <button type="submit" disabled={cargando}>
          {cargando ? 'Calculando...' : 'Calcular cobro'}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {resultado && (
        <div className="card">
          <div className="card-title">
            Resultado <span className={`badge ${resultado.estado_pago}`}>{resultado.estado_pago}</span>
          </div>
          <div className="card-meta">
            Comisión plataforma: ${resultado.comision_plataforma} · Monto para el operador: $
            {resultado.monto_operador}
          </div>
        </div>
      )}
    </>
  );
}
