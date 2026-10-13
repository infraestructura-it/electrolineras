import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ReactNode, useEffect, useState } from 'react';
import {
  BatteryCharging,
  Building2,
  FileText,
  LayoutDashboard,
  LogOut,
  LucideIcon,
  Menu,
  PlugZap,
  RadioTower,
  Receipt,
  SlidersHorizontal,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';

interface Enlace {
  href: string;
  texto: string;
  icono: LucideIcon;
  soloAdmin?: boolean;
  textoOperador?: string;
}

// Grupos del menú lateral. Los de "Sistema" solo los ve el administrador.
const GRUPOS: { titulo: string; enlaces: Enlace[] }[] = [
  {
    titulo: 'Operación',
    enlaces: [
      { href: '/', texto: 'Inicio', icono: LayoutDashboard },
      { href: '/cargadores', texto: 'Cargadores', icono: PlugZap },
      { href: '/sesiones', texto: 'Sesiones de carga', icono: BatteryCharging },
    ],
  },
  {
    titulo: 'Negocio',
    enlaces: [
      { href: '/operadores', texto: 'Operadores', textoOperador: 'Mi empresa', icono: Building2 },
      { href: '/proformas', texto: 'Proformas', icono: FileText },
      { href: '/facturacion', texto: 'Facturación', icono: Receipt },
    ],
  },
  {
    titulo: 'Sistema',
    enlaces: [
      { href: '/ocpp', texto: 'Consola OCPP', icono: RadioTower, soloAdmin: true },
      { href: '/usuarios', texto: 'Usuarios', icono: Users, soloAdmin: true },
      { href: '/configuracion', texto: 'Configuración', icono: SlidersHorizontal, soloAdmin: true },
    ],
  },
];

const RUTAS_ADMIN = GRUPOS.flatMap((g) => g.enlaces.filter((e) => e.soloAdmin).map((e) => e.href));

const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

export default function PanelLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { usuario, cargando, esAdmin, salir } = useAuth();
  const [menuAbierto, setMenuAbierto] = useState(false);

  // Sin sesión: al login, recordando a dónde quería ir.
  useEffect(() => {
    if (!cargando && !usuario) router.replace(`/login?siguiente=${encodeURIComponent(router.asPath)}`);
  }, [cargando, usuario, router]);

  // Cerrar el menú móvil al navegar.
  useEffect(() => setMenuAbierto(false), [router.pathname]);

  if (cargando || !usuario) {
    return <div className="pantalla-carga" aria-busy="true">Cargando panel…</div>;
  }

  const activo = (href: string) => (href === '/' ? router.pathname === '/' : router.pathname.startsWith(href));
  const sinPermiso = !esAdmin && RUTAS_ADMIN.some((r) => router.pathname.startsWith(r));

  return (
    <div className="panel-raiz">
      <Head>
        <title>Electrolineras · Panel</title>
      </Head>

      <header className="barra-movil">
        <button className="btn-icono" aria-label="Abrir menú" onClick={() => setMenuAbierto(true)}>
          <Menu size={22} />
        </button>
        <span className="marca-texto">Electrolineras</span>
      </header>

      {menuAbierto && <div className="velo" onClick={() => setMenuAbierto(false)} aria-hidden="true" />}

      <aside className={`lateral ${menuAbierto ? 'abierto' : ''}`} aria-label="Menú principal">
        <div className="lateral-marca">
          <span className="marca-sello" aria-hidden="true">
            <Zap size={18} strokeWidth={2.5} />
          </span>
          <span className="marca-texto">Electrolineras</span>
          <button className="btn-icono solo-movil" aria-label="Cerrar menú" onClick={() => setMenuAbierto(false)}>
            <X size={20} />
          </button>
        </div>

        <nav className="lateral-nav">
          {GRUPOS.map((grupo) => {
            const enlaces = grupo.enlaces.filter((e) => esAdmin || !e.soloAdmin);
            if (!enlaces.length) return null;
            return (
              <div className="nav-grupo" key={grupo.titulo}>
                <div className="nav-grupo-titulo">{grupo.titulo}</div>
                {enlaces.map(({ href, texto, textoOperador, icono: Icono }) => (
                  <Link key={href} href={href} className={`nav-enlace ${activo(href) ? 'activo' : ''}`} aria-current={activo(href) ? 'page' : undefined}>
                    <Icono size={19} strokeWidth={1.9} aria-hidden="true" />
                    <span>{!esAdmin && textoOperador ? textoOperador : texto}</span>
                  </Link>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="lateral-usuario">
          <span className="avatar" aria-hidden="true">{iniciales(usuario.nombre)}</span>
          <div className="usuario-datos">
            <div className="usuario-nombre">{usuario.nombre}</div>
            <div className="usuario-rol">{usuario.rol === 'admin' ? 'Administrador' : 'Operador'}</div>
          </div>
          <button className="btn-icono" onClick={salir} aria-label="Cerrar sesión" title="Cerrar sesión">
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <main className="contenido">
        {sinPermiso ? (
          <div className="vacio">
            <h1>Sin acceso</h1>
            <p>Esta sección es solo para administradores de la plataforma.</p>
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
