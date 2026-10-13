import { useEffect, useState } from 'react';
import { cargadoresApi, operadoresApi, Cargador, Operador, formatoCOP } from '@/lib/api';

export default function CargadoresPage() {
  const [cargadores, setCargadores] = useState<Cargador[]>([]);
  const [operadores, setOperadores] = useState<Operador[]>([]);
  const [numeroSerie, setNumeroSerie] = useState('');
  const [modelo, setModelo] = useState('MDXDC3001');
  const [operadorId, setOperadorId] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [tarifa, setTarifa] = useState('');
  const [origen, setOrigen] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function cargar() {
    try {
      const [listaCargadores, listaOperadores] = await Promise.all([
        cargadoresApi.listar(),
        operadoresApi.listar(),
      ]);
      setCargadores(listaCargadores);
      setOperadores(listaOperadores);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    setOrigen(window.location.origin);
    cargar();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    try {
      await cargadoresApi.registrar({
        numero_serie: numeroSerie,
        modelo,
        operador_id: operadorId,
        ubicacion: ubicacion || undefined,
        tarifa_por_kwh: tarifa ? Number(tarifa) : null,
      });
      setNumeroSerie('');
      setUbicacion('');
      setTarifa('');
      await cargar();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  async function cambiarTarifa(c: Cargador) {
    const valor = window.prompt(`Nueva tarifa por kWh (COP) para ${c.numero_serie}`, String(c.tarifa_por_kwh ?? ''));
    if (valor === null || valor.trim() === '') return;
    try {
      await cargadoresApi.actualizar(c.numero_serie, { tarifa_por_kwh: Number(valor) });
      await cargar();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function alternarEstado(c: Cargador) {
    try {
      await cargadoresApi.actualizar(c.numero_serie, { estado: c.estado === 'activo' ? 'inactivo' : 'activo' });
      await cargar();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <h1>Cargadores</h1>
      <p>
        Hardware físico registrado por número de serie, vinculado a un operador. El número de serie
        debe coincidir con el <code>pile_number_master</code> configurado en el cargador.
      </p>

      <form onSubmit={onSubmit}>
        <label htmlFor="numero_serie">Número de serie (pile number)</label>
        <input
          id="numero_serie"
          placeholder="MDX20260715001"
          value={numeroSerie}
          onChange={(e) => setNumeroSerie(e.target.value)}
          required
        />

        <label htmlFor="modelo">Modelo</label>
        <input id="modelo" value={modelo} onChange={(e) => setModelo(e.target.value)} required />

        <label htmlFor="operador">Operador dueño</label>
        <select id="operador" value={operadorId} onChange={(e) => setOperadorId(e.target.value)} required>
          <option value="">Selecciona un operador</option>
          {operadores.map((op) => (
            <option key={op.id} value={op.id}>
              {op.nombre}
            </option>
          ))}
        </select>

        <label htmlFor="ubicacion">Ubicación (la ve el usuario)</label>
        <input
          id="ubicacion"
          placeholder="Conjunto Los Pinos · Sótano 1"
          value={ubicacion}
          onChange={(e) => setUbicacion(e.target.value)}
        />

        <label htmlFor="tarifa">Tarifa por kWh (COP)</label>
        <input
          id="tarifa"
          type="number"
          min="1"
          step="1"
          placeholder="1500"
          value={tarifa}
          onChange={(e) => setTarifa(e.target.value)}
        />

        <button type="submit" disabled={cargando}>
          {cargando ? 'Registrando...' : 'Registrar cargador'}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {cargadores.map((c) => {
        const urlQr = `${origen}/c/${encodeURIComponent(c.numero_serie)}`;
        return (
          <div className="card" key={c.id}>
            <div className="card-title">
              {c.numero_serie} <span className={`badge ${c.estado}`}>{c.estado}</span>
            </div>
            <div className="card-meta">
              {c.modelo} · {c.ubicacion || 'ubicación sin definir'} ·{' '}
              {c.tarifa_por_kwh != null ? `${formatoCOP(c.tarifa_por_kwh)}/kWh` : 'sin tarifa'}
            </div>
            <div className="card-meta" style={{ marginTop: 8 }}>
              URL del QR: <a href={urlQr} target="_blank" rel="noreferrer">{urlQr}</a>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => cambiarTarifa(c)}>
                Cambiar tarifa
              </button>
              <button type="button" onClick={() => alternarEstado(c)}>
                {c.estado === 'activo' ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          </div>
        );
      })}

      {cargadores.length === 0 && !error && <p className="card-meta">Aún no hay cargadores registrados.</p>}
    </>
  );
}
