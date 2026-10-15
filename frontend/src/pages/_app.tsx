import type { AppProps } from 'next/app';
import { useRouter } from 'next/router';
import PanelLayout from '@/components/PanelLayout';
import AppUsuarioLayout from '@/components/AppUsuarioLayout';
import { ProveedorAuth } from '@/lib/auth';
import 'leaflet/dist/leaflet.css';
import '@/styles/globals.css';

// App de usuario final (QR del cargador, mapa y cuenta del conductor): sin login del panel ni menú.
const RUTAS_USUARIO = ['/c/', '/carga/', '/app'];
// Pantallas de acceso y el monitor (pantalla completa en otra pestaña): con sesión, sin barra lateral.
const RUTAS_ACCESO = ['/login', '/registro', '/monitor'];

export default function App({ Component, pageProps }: AppProps) {
  const { pathname } = useRouter();

  // Documento público de una proforma (lo abre su QR): página completa, sin marco.
  if (pathname.startsWith('/p/')) return <Component {...pageProps} />;

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
