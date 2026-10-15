import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ReactNode, useEffect, useState } from 'react';
import {
  Activity,
  BatteryCharging,
  Building2,
  ExternalLink,
  FileText,
  KeyRound,
  Map as IconoMapa,
  MapPinned,
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
import { NOMBRE_ROL, Rol } from '@/lib/api';
import { useAuth } from '@/lib/auth';

interface Enlace {
  href: string;
  texto: string;
  icono: LucideIcon;
  roles?: Rol[]; // sin roles: todos los usuarios del panel
  textoEmpresa?: string; // texto para usuarios de una empresa
  nuevaPestana?: boolean;
}

const GESTION: Rol[] = ['admin', 'administrador'];

// Grupos del menú lateral, filtrados por el rol del usuario.
const GRUPOS: { titulo: string; enlaces: Enlace[] }[] = [
  {
    titulo: 'Operación',
    enlaces: [
      { href: '/', texto: 'Inicio', icono: LayoutDashboard },
      { href: '/monitor', texto: 'Monitor en vivo', icono: Activity, nuevaPestana: true },
      { href: '/electrolineras', texto: 'Electrolineras', icono: MapPinned },
      { href: '/cargadores', texto: 'Cargadores', icono: PlugZap },
      { href: '/sesiones', texto: 'Sesiones de carga', icono: BatteryCharging },
    ],
  },
  {
    titulo: 'Negocio',
    enlaces: [
      { href: '/operadores', texto: 'Empresas', textoEmpresa: 'Mi empresa', icono: Building2, roles: GESTION },
      { href: '/proformas', texto: 'Proformas', icono: FileText },
      { href: '/facturacion', texto: 'Facturación', icono: Receipt, roles: GESTION },
    ],
  },
  {
    titulo: 'Sistema',
    enlaces: [
      { href: '/ocpp', texto: 'Consola OCPP', icono: RadioTower, roles: ['admin'] },
      { href: '/usuarios', texto: 'Usuarios', icono: Users, roles: GESTION },
      { href: '/zonas', texto: 'Zonas', icono: IconoMapa, roles: ['admin'] },
      { href: '/licencias', texto: 'Licencias', icono: KeyRound, roles: GESTION },
      { href: '/configuracion', texto: 'Configuración', icono: SlidersHorizontal, roles: ['admin'] },
    ],
  },
];

const RESTRINGIDAS = GRUPOS.flatMap((g) => g.enlaces.filter((e) => e.roles));

const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

export default function PanelLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { usuario, cargando, esAdmin, tieneRol, salir } = useAuth();
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
  const permitido = (e: Enlace) => !e.roles || tieneRol(...e.roles);
  const sinPermiso = RESTRINGIDAS.some((e) => router.pathname.startsWith(e.href) && !permitido(e));

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
            const enlaces = grupo.enlaces.filter(permitido);
            if (!enlaces.length) return null;
            return (
              <div className="nav-grupo" key={grupo.titulo}>
                <div className="nav-grupo-titulo">{grupo.titulo}</div>
                {enlaces.map(({ href, texto, textoEmpresa, icono: Icono, nuevaPestana }) =>
                  nuevaPestana ? (
                    // Se abre en otra pestaña: pensado para dejarlo a la vista en una pantalla aparte.
                    <a key={href} href={href} target="_blank" rel="noopener" className="nav-enlace">
                      <Icono size={19} strokeWidth={1.9} aria-hidden="true" />
                      <span>{texto}</span>
                      <ExternalLink size={14} className="nav-externo" aria-label="(se abre en otra pestaña)" />
                    </a>
                  ) : (
                    <Link key={href} href={href} className={`nav-enlace ${activo(href) ? 'activo' : ''}`} aria-current={activo(href) ? 'page' : undefined}>
                      <Icono size={19} strokeWidth={1.9} aria-hidden="true" />
                      <span>{!esAdmin && textoEmpresa ? textoEmpresa : texto}</span>
                    </Link>
                  ),
                )}
              </div>
            );
          })}
        </nav>

        <div className="lateral-usuario">
          <span className="avatar" aria-hidden="true">{iniciales(usuario.nombre)}</span>
          <div className="usuario-datos">
            <div className="usuario-nombre">{usuario.nombre}</div>
            <div className="usuario-rol">{NOMBRE_ROL[usuario.rol] ?? usuario.rol}</div>
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
            <p>Tu rol ({NOMBRE_ROL[usuario.rol]}) no tiene acceso a esta sección.</p>
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
