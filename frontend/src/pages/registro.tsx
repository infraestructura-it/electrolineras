import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AccesoLayout from '@/components/AccesoLayout';
import { MensajeError } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export default function Registro() {
  const router = useRouter();
  const { usuario, registrarse } = useAuth();
  const [form, setForm] = useState({ empresa: '', nombre: '', email: '', password: '', confirmar: '' });
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (usuario) router.replace('/');
  }, [usuario, router]);

  const cambiar = (campo: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [campo]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirmar) {
      setError('Las dos claves no coinciden');
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      await registrarse({ empresa: form.empresa, nombre: form.nombre, email: form.email, password: form.password });
    } catch (e) {
      setError((e as Error).message);
      setEnviando(false);
    }
  }

  return (
    <AccesoLayout titulo="Registrar empresa">
      <h1>Registra tu empresa</h1>
      <p>Crea la cuenta del operador dueño de los cargadores. Después podrás registrarlos y fijar tus tarifas.</p>

      <form className="formulario" onSubmit={onSubmit}>
        <div className="campo">
          <label htmlFor="empresa">Empresa o conjunto</label>
          <input id="empresa" placeholder="Conjunto Los Pinos" value={form.empresa} onChange={cambiar('empresa')} required />
        </div>
        <div className="campo">
          <label htmlFor="nombre">Tu nombre</label>
          <input id="nombre" autoComplete="name" value={form.nombre} onChange={cambiar('nombre')} required />
        </div>
        <div className="campo">
          <label htmlFor="email">Correo</label>
          <input id="email" type="email" autoComplete="email" value={form.email} onChange={cambiar('email')} required />
        </div>
        <div className="campo">
          <label htmlFor="password">Clave</label>
          <input id="password" type="password" autoComplete="new-password" minLength={8} value={form.password} onChange={cambiar('password')} required />
          <span className="ayuda">Mínimo 8 caracteres.</span>
        </div>
        <div className="campo">
          <label htmlFor="confirmar">Repite la clave</label>
          <input id="confirmar" type="password" autoComplete="new-password" value={form.confirmar} onChange={cambiar('confirmar')} required />
        </div>
        <MensajeError>{error}</MensajeError>
        <button className="btn" type="submit" disabled={enviando}>
          {enviando ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>
      </form>

      <p className="pie">
        ¿Ya tienes cuenta? <Link href="/login">Inicia sesión</Link>
      </p>
    </AccesoLayout>
  );
}
