import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { startAuthentication } from '@simplewebauthn/browser';
import { authApi, guardarToken, huellaApi, leerToken, Rol, Usuario } from './api';

interface ContextoAuth {
  usuario: Usuario | null;
  cargando: boolean;
  esAdmin: boolean; // administrador de la plataforma
  puedeGestionar: boolean; // admin de plataforma o administrador de empresa (crear y editar)
  tieneRol: (...roles: Rol[]) => boolean;
  entrar: (email: string, password: string) => Promise<void>;
  entrarConHuella: () => Promise<void>;
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

  // Huella: el dispositivo muestra sus passkeys para este dominio y pide la huella/rostro/PIN.
  const entrarConHuella = useCallback(async () => {
    const opciones = await huellaApi.opcionesLogin();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const respuesta = await startAuthentication({ optionsJSON: opciones as any });
    const { token, usuario } = await huellaApi.login(respuesta);
    guardarToken(token);
    setUsuario(usuario);
  }, []);

  const registrarse = useCallback(async (data: { empresa: string; nombre: string; email: string; password: string }) => {
    const { token, usuario } = await authApi.registro(data);
    guardarToken(token);
    setUsuario(usuario);
  }, []);

  return (
    <Contexto.Provider
      value={{
        usuario,
        cargando,
        esAdmin: usuario?.rol === 'admin',
        puedeGestionar: usuario?.rol === 'admin' || usuario?.rol === 'administrador',
        tieneRol: (...roles: Rol[]) => Boolean(usuario && roles.includes(usuario.rol)),
        entrar,
        entrarConHuella,
        registrarse,
        salir,
      }}
    >
      {children}
    </Contexto.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('useAuth debe usarse dentro de ProveedorAuth');
  return ctx;
}
