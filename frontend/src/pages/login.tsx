import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Eye, EyeOff } from 'lucide-react';
import AccesoLayout from '@/components/AccesoLayout';
import { MensajeError } from '@/components/ui';
import { configuracionApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function Login() {
  const router = useRouter();
  const { usuario, entrar } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [registroAbierto, setRegistroAbierto] = useState(false);

  const siguiente = typeof router.query.siguiente === 'string' && router.query.siguiente.startsWith('/') ? router.query.siguiente : '/';

  useEffect(() => {
    if (usuario) router.replace(siguiente);
  }, [usuario, router, siguiente]);

  useEffect(() => {
    configuracionApi
      .publica()
      .then((c) => setRegistroAbierto(c.permitir_registro_operadores))
      .catch(() => setRegistroAbierto(false));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await entrar(email, password);
    } catch (e) {
      setError((e as Error).message);
      setEnviando(false);
    }
  }

  return (
    <AccesoLayout titulo="Iniciar sesión">
      <h1>Iniciar sesión</h1>
      <p>Entra al panel de tus cargadores.</p>

      <form className="formulario" onSubmit={onSubmit}>
        <div className="campo">
          <label htmlFor="email">Correo</label>
          <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </div>
        <div className="campo">
          <label htmlFor="password">Clave</label>
          <div style={{ position: 'relative' }}>
            <input
              id="password"
              type={verClave ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ paddingRight: 44 }}
            />
            <button
              type="button"
              className="btn-icono"
              onClick={() => setVerClave((v) => !v)}
              aria-label={verClave ? 'Ocultar clave' : 'Mostrar clave'}
              style={{ position: 'absolute', right: 2, top: 2 }}
            >
              {verClave ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        <MensajeError>{error}</MensajeError>
        <button className="btn" type="submit" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      {registroAbierto && (
        <p className="pie">
          ¿Tienes cargadores y aún no tienes cuenta? <Link href="/registro">Registra tu empresa</Link>
        </p>
      )}
    </AccesoLayout>
  );
}
