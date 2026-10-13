import type { AppProps } from 'next/app';
import { useRouter } from 'next/router';
import PanelLayout from '@/components/PanelLayout';
import AppUsuarioLayout from '@/components/AppUsuarioLayout';
import { ProveedorAuth } from '@/lib/auth';
import '@/styles/globals.css';

// App de usuario final (se abre desde el QR del cargador): sin login ni menú del panel.
const RUTAS_USUARIO = ['/c/', '/carga/'];
// Pantallas de acceso: con sesión, pero sin barra lateral.
const RUTAS_ACCESO = ['/login', '/registro'];

export default function App({ Component, pageProps }: AppProps) {
  const { pathname } = useRouter();

  if (RUTAS_USUARIO.some((ruta) => pathname.startsWith(ruta))) {
    return (
      <AppUsuarioLayout>
        <Component {...pageProps} />
      </AppUsuarioLayout>
    );
  }

  return (
    <ProveedorAuth>
      {RUTAS_ACCESO.includes(pathname) ? (
        <Component {...pageProps} />
      ) : (
        <PanelLayout>
          <Component {...pageProps} />
        </PanelLayout>
      )}
    </ProveedorAuth>
  );
}
