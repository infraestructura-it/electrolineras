import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { authApi, guardarToken, leerToken, Usuario } from './api';

interface ContextoAuth {
  usuario: Usuario | null;
  cargando: boolean;
  esAdmin: boolean;
  entrar: (email: string, password: string) => Promise<void>;
  registrarse: (data: { empresa: string; nombre: string; email: string; password: string }) => Promise<void>;
  salir: () => void;
}

const Contexto = createContext<ContextoAuth | null>(null);

export function ProveedorAuth({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);

  // Al abrir el panel: si hay token guardado, recuperar el usuario.
  useEffect(() => {
    if (!leerToken()) {
      setCargando(false);
      return;
    }
    authApi
      .yo()
      .then(setUsuario)
      .catch(() => guardarToken(null))
      .finally(() => setCargando(false));
  }, []);

  const salir = useCallback(() => {
    guardarToken(null);
    setUsuario(null);
    router.replace('/login');
  }, [router]);

  // Cualquier 401 de la API (token vencido) devuelve al login.
  useEffect(() => {
    const alExpirar = () => {
      if (!leerToken()) return;
      guardarToken(null);
      setUsuario(null);
      router.replace(`/login?siguiente=${encodeURIComponent(router.asPath)}`);
    };
    window.addEventListener('electrolineras:sesion-expirada', alExpirar);
    return () => window.removeEventListener('electrolineras:sesion-expirada', alExpirar);
  }, [router]);

  const entrar = useCallback(async (email: string, password: string) => {
    const { token, usuario } = await authApi.login(email, password);
    guardarToken(token);
    setUsuario(usuario);
  }, []);

  const registrarse = useCallback(async (data: { empresa: string; nombre: string; email: string; password: string }) => {
    const { token, usuario } = await authApi.registro(data);
    guardarToken(token);
    setUsuario(usuario);
  }, []);

  return (
    <Contexto.Provider value={{ usuario, cargando, esAdmin: usuario?.rol === 'admin', entrar, registrarse, salir }}>
      {children}
    </Contexto.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('useAuth debe usarse dentro de ProveedorAuth');
  return ctx;
}
