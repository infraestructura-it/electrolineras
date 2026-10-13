import Head from 'next/head';
import { ReactNode } from 'react';

// Marco de la app de usuario final: una sola columna, pensado para el celular.
export default function AppUsuarioLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#0f172a" />
        <title>Electrolineras — Carga tu vehículo</title>
      </Head>
      <header className="app-header">
        <span className="app-marca">
          <span className="app-rayo" aria-hidden="true">⚡</span> Electrolineras
        </span>
      </header>
      <main className="app-usuario">{children}</main>
    </>
  );
}
