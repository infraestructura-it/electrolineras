import { useState } from 'react';
import { useRouter } from 'next/router';
import { conductorApi } from '@/lib/api';

// Entrar o crear la cuenta de la app del conductor (para acumular y redimir puntos).
export default function EntrarConductor() {
  const router = useRouter();
  const siguiente = typeof router.query.siguiente === 'string' && router.query.siguiente.startsWith('/') ? router.query.siguiente : '/app/cuenta';
  const [modo, setModo] = useState<'entrar' | 'registro'>('entrar');
  const [datos, setDatos] = useState({ nombre: '', email: '', celular: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const cambiar = (k: keyof typeof datos) => (e: React.ChangeEvent<HTMLInputElement>) => setDatos({ ...datos, [k]: e.target.value });

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      if (modo === 'entrar') await conductorApi.login(datos.email, datos.password);
      else await conductorApi.registro({ nombre: datos.nombre, email: datos.email, celular: datos.celular || undefined, password: datos.password });
      router.replace(siguiente);
    } catch (e) {
      setError((e as Error).message);
      setEnviando(false);
    }
  }

  return (
    <>
      <section className="app-panel app-centro">
        <h1 className="app-titulo">{modo === 'entrar' ? 'Entra a tu cuenta' : 'Crea tu cuenta'}</h1>
        <p className="app-texto">Acumula puntos con cada kWh y úsalos como descuento en tus próximas cargas.</p>
      </section>

      <div className="app-filtros app-pestanas" role="tablist">
        <button role="tab" aria-selected={modo === 'entrar'} className={`chip ${modo === 'entrar' ? 'activo' : ''}`} onClick={() => setModo('entrar')}>
          Ya tengo cuenta
        </button>
        <button role="tab" aria-selected={modo === 'registro'} className={`chip ${modo === 'registro' ? 'activo' : ''}`} onClick={() => setModo('registro')}>
          Soy nuevo
        </button>
      </div>

      <form className="app-panel app-form" onSubmit={enviar}>
        {modo === 'registro' && (
          <>
            <label htmlFor="nombre">Nombre</label>
            <input id="nombre" autoComplete="name" value={datos.nombre} onChange={cambiar('nombre')} required />
          </>
        )}
        <label htmlFor="email">Correo</label>
        <input id="email" type="email" inputMode="email" autoComplete="email" value={datos.email} onChange={cambiar('email')} required />
        {modo === 'registro' && (
          <>
            <label htmlFor="celular">Celular (opcional)</label>
            <input id="celular" type="tel" inputMode="tel" autoComplete="tel" value={datos.celular} onChange={cambiar('celular')} />
          </>
        )}
        <label htmlFor="password">Clave</label>
        <input
          id="password"
          type="password"
          autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
          minLength={8}
          value={datos.password}
          onChange={cambiar('password')}
          required
        />
        {modo === 'registro' && <p className="app-nota">Mínimo 8 caracteres.</p>}
        <button className="btn app-boton" type="submit" disabled={enviando}>
          {enviando ? 'Un momento…' : modo === 'entrar' ? 'Entrar' : 'Crear cuenta'}
        </button>
        {error && <p className="app-error">{error}</p>}
      </form>
    </>
  );
}
