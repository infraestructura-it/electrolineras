import Link from 'next/link';
import { ReactNode } from 'react';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <nav className="topnav">
        <Link href="/">Inicio</Link>
        <Link href="/operadores">Operadores</Link>
        <Link href="/cargadores">Cargadores</Link>
        <Link href="/sesiones">Sesiones de carga</Link>
        <Link href="/facturacion">Facturación</Link>
      </nav>
      <div className="container">{children}</div>
    </>
  );
}
