import { useEffect, useState } from 'react';
import { operadoresApi, Operador } from '@/lib/api';

export default function OperadoresPage() {
  const [operadores, setOperadores] = useState<Operador[]>([]);
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [cuenta, setCuenta] = useState('');
  const [comision, setComision] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function cargar() {
    try {
      setOperadores(await operadoresApi.listar());
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
      await operadoresApi.crear({
        nombre,
        email_contacto: email || undefined,
        cuenta_beneficiario: cuenta || undefined,
        comision_pactada: comision ? Number(comision) : null,
      });
      setNombre('');
      setEmail('');
      setCuenta('');
      setComision('');
      await cargar();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <>
      <h1>Operadores</h1>
      <p>Dueños de cargadores registrados en la plataforma.</p>

      <form onSubmit={onSubmit}>
        <label htmlFor="nombre">Nombre del operador</label>
        <input id="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required />

        <label htmlFor="email">Email de contacto (opcional)</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />

        <label htmlFor="cuenta">Cuenta beneficiaria para dispersión (opcional)</label>
        <input id="cuenta" value={cuenta} onChange={(e) => setCuenta(e.target.value)} />

        <label htmlFor="comision">Comisión pactada con la plataforma (%)</label>
        <input
          id="comision"
          type="number"
          step="0.01"
          min="0"
          max="100"
          placeholder="Vacío = 20 % por defecto"
          value={comision}
          onChange={(e) => setComision(e.target.value)}
        />

        <button type="submit" disabled={cargando}>
          {cargando ? 'Creando...' : 'Registrar operador'}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {operadores.map((op) => (
        <div className="card" key={op.id}>
          <div className="card-title">{op.nombre}</div>
          <div className="card-meta">
            {op.email_contacto || 'Sin email registrado'} · Comisión pactada:{' '}
            {op.comision_pactada != null ? `${op.comision_pactada}%` : '20% (por defecto)'} · Cuenta:{' '}
            {op.cuenta_beneficiario || 'sin definir'}
          </div>
        </div>
      ))}

      {operadores.length === 0 && !error && <p className="card-meta">Aún no hay operadores registrados.</p>}
    </>
  );
}
