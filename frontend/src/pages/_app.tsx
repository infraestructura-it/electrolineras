import type { AppProps } from 'next/app';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import AppUsuarioLayout from '@/components/AppUsuarioLayout';
import '@/styles/globals.css';

// Rutas de la app de usuario final (se abren desde el QR del cargador): sin el menú del panel.
const RUTAS_USUARIO = ['/c/', '/carga/'];

export default function App({ Component, pageProps }: AppProps) {
  const { pathname } = useRouter();
  const esAppUsuario = RUTAS_USUARIO.some((ruta) => pathname.startsWith(ruta));
  const Contenedor = esAppUsuario ? AppUsuarioLayout : Layout;

  return (
    <Contenedor>
      <Component {...pageProps} />
    </Contenedor>
  );
}
