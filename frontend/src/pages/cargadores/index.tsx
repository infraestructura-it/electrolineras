import { useEffect, useState } from 'react';
import { cargadoresApi, operadoresApi, Cargador, Operador } from '@/lib/api';

export default function CargadoresPage() {
  const [cargadores, setCargadores] = useState<Cargador[]>([]);
  const [operadores, setOperadores] = useState<Operador[]>([]);
  const [numeroSerie, setNumeroSerie] = useState('');
  const [modelo, setModelo] = useState('MDXDC3001');
  const [operadorId, setOperadorId] = useState('');
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
    cargar();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    try {
      await cargadoresApi.registrar({ numero_serie: numeroSerie, modelo, operador_id: operadorId });
      setNumeroSerie('');
      await cargar();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <>
      <h1>Cargadores</h1>
      <p>Hardware físico registrado por número de serie, vinculado a un operador.</p>

      <form onSubmit={onSubmit}>
        <label htmlFor="numero_serie">Número de serie</label>
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

        <button type="submit" disabled={cargando}>
          {cargando ? 'Registrando...' : 'Registrar cargador'}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {cargadores.map((c) => (
        <div className="card" key={c.id}>
          <div className="card-title">
            {c.numero_serie} <span className={`badge ${c.estado}`}>{c.estado}</span>
          </div>
          <div className="card-meta">
            {c.modelo} · {c.ubicacion || 'ubicación sin definir'}
          </div>
        </div>
      ))}

      {cargadores.length === 0 && !error && <p className="card-meta">Aún no hay cargadores registrados.</p>}
    </>
  );
}
