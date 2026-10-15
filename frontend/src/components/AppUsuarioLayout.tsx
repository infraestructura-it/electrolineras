import Head from 'next/head';
import { ReactNode } from 'react';
import Link from 'next/link';
import { Map, UserRound, Zap } from 'lucide-react';

// Marco de la app de usuario final: una sola columna, pensado para el celular.
export default function AppUsuarioLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>Electrolineras · Carga tu vehículo</title>
      </Head>
      <header className="app-header">
        <Link className="app-marca" href="/app">
          <span className="marca-sello" aria-hidden="true">
            <Zap size={16} strokeWidth={2.5} />
          </span>
          Electrolineras
        </Link>
        <nav className="app-nav" aria-label="App">
          <Link href="/app" title="Mapa de electrolineras">
            <Map size={18} aria-hidden="true" />
            <span>Mapa</span>
          </Link>
          <Link href="/app/cuenta" title="Mi cuenta y puntos">
            <UserRound size={18} aria-hidden="true" />
            <span>Mi cuenta</span>
          </Link>
        </nav>
      </header>
      <main className="app-usuario">{children}</main>
    </>
  );
}
