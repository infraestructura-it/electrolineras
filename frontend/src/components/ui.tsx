import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { CircleAlert, X } from 'lucide-react';
import type { EstadoCargador, EstadoSesion } from '@/lib/api';

export function Encabezado({ titulo, descripcion, children }: { titulo: string; descripcion?: string; children?: ReactNode }) {
  return (
    <div className="encabezado">
      <div>
        <h1>{titulo}</h1>
        {descripcion && <p>{descripcion}</p>}
      </div>
      {children && <div className="acciones">{children}</div>}
    </div>
  );
}

export function MensajeError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div className="mensaje-error" role="alert">
      <CircleAlert size={18} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{children}</span>
    </div>
  );
}

const TEXTO_SESION: Record<EstadoSesion, [string, string]> = {
  iniciando: ['Iniciando', 'alerta'],
  en_curso: ['Cargando', 'carga'],
  deteniendo: ['Deteniendo', 'alerta'],
  finalizada: ['Finalizada', 'ok'],
  fallida: ['Fallida', 'falla'],
};

export function EstadoSesionBadge({ estado }: { estado: EstadoSesion }) {
  const [texto, clase] = TEXTO_SESION[estado] ?? [estado, ''];
  return <span className={`estado ${clase}`}>{texto}</span>;
}

const TEXTO_CARGADOR: Record<EstadoCargador, [string, string]> = {
  activo: ['Disponible', 'ok'],
  inactivo: ['Inactivo', ''],
  en_falla: ['En falla', 'falla'],
};

export function EstadoCargadorBadge({ estado, cargando }: { estado: EstadoCargador; cargando?: boolean }) {
  if (cargando) return <span className="estado carga">Cargando</span>;
  const [texto, clase] = TEXTO_CARGADOR[estado] ?? [estado, ''];
  return <span className={`estado ${clase}`}>{texto}</span>;
}

export function Modal({
  titulo,
  descripcion,
  alCerrar,
  children,
}: {
  titulo: string;
  descripcion?: string;
  alCerrar: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => e.key === 'Escape' && alCerrar();
    window.addEventListener('keydown', alTeclear);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', alTeclear);
  }, [alCerrar]);

  return (
    <div className="modal-fondo" onMouseDown={(e) => e.target === e.currentTarget && alCerrar()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo} tabIndex={-1} ref={ref}>
        <div className="modal-cabeza">
          <div>
            <h2>{titulo}</h2>
            {descripcion && <p>{descripcion}</p>}
          </div>
          <button className="btn-icono" onClick={alCerrar} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Carga datos de la API y, si se indica, los refresca cada `intervaloMs`.
// Cambiar `clave` (ej. un filtro) fuerza una recarga inmediata.
export function useDatos<T>(cargar: () => Promise<T>, intervaloMs?: number, clave?: unknown) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cargarRef = useRef(cargar);
  cargarRef.current = cargar;

  const recargar = useCallback(async () => {
    try {
      setDatos(await cargarRef.current());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    recargar();
    if (!intervaloMs) return;
    const id = setInterval(recargar, intervaloMs);
    return () => clearInterval(id);
  }, [recargar, intervaloMs, clave]);

  return { datos, error, recargar };
}

// Base de las URLs públicas (QR de cargadores y de proformas): la URL pública configurada
// o, si está vacía, la dirección con la que se abrió el panel.
export function useBasePublica() {
  const [base, setBase] = useState('');
  useEffect(() => {
    import('@/lib/api').then(({ configuracionApi }) =>
      configuracionApi
        .publica()
        .then((c) => setBase(c.url_publica_app || window.location.origin))
        .catch(() => setBase(window.location.origin)),
    );
  }, []);
  return base;
}
