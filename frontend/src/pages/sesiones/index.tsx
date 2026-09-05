import { useState } from 'react';
import { sesionesApi, SesionCarga } from '@/lib/api';

export default function SesionesPage() {
  const [cargadorId, setCargadorId] = useState('');
  const [usuarioId, setUsuarioId] = useState('');
  const [sesionActiva, setSesionActiva] = useState<SesionCarga | null>(null);
  const [kwh, setKwh] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function onIniciar(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    try {
      const sesion = await sesionesApi.iniciar({ cargador_id: cargadorId, usuario_id: usuarioId });
      setSesionActiva(sesion);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  async function onFinalizar(e: React.FormEvent) {
    e.preventDefault();
    if (!sesionActiva) return;
    setCargando(true);
    try {
      const sesion = await sesionesApi.finalizar(sesionActiva.id, Number(kwh));
      setSesionActiva(sesion);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <>
      <h1>Sesiones de carga</h1>
      <p>
        Esto simula lo que dispara el gateway OCPP cuando un usuario escanea el QR e inicia
        una carga real en el cargador.
      </p>

      {!sesionActiva && (
        <form onSubmit={onIniciar}>
          <label htmlFor="cargador_id">ID del cargador</label>
          <input id="cargador_id" value={cargadorId} onChange={(e) => setCargadorId(e.target.value)} required />

          <label htmlFor="usuario_id">ID del usuario</label>
          <input id="usuario_id" value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)} required />

          <button type="submit" disabled={cargando}>
            {cargando ? 'Iniciando...' : 'Iniciar sesión de carga'}
          </button>
        </form>
      )}

      {sesionActiva && sesionActiva.estado === 'en_curso' && (
        <form onSubmit={onFinalizar}>
          <div className="card">
            <div className="card-title">
              Sesión activa <span className="badge en_curso">en_curso</span>
            </div>
            <div className="card-meta">
              ID: {sesionActiva.id} · Inicio: {new Date(sesionActiva.inicio).toLocaleString()}
            </div>
          </div>

          <label htmlFor="kwh">kWh consumidos (reportados por el cargador)</label>
          <input id="kwh" type="number" step="0.01" value={kwh} onChange={(e) => setKwh(e.target.value)} required />

          <button type="submit" disabled={cargando}>
            {cargando ? 'Finalizando...' : 'Finalizar sesión'}
          </button>
        </form>
      )}

      {sesionActiva && sesionActiva.estado === 'finalizada' && (
        <div className="card">
          <div className="card-title">
            Sesión finalizada <span className="badge finalizada">finalizada</span>
          </div>
          <div className="card-meta">
            ID: {sesionActiva.id} · Consumo: {sesionActiva.kwh_consumidos} kWh
          </div>
        </div>
      )}

      {error && <p className="error">{error}</p>}
    </>
  );
}
