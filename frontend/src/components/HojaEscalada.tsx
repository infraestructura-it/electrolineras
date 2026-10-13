import { ReactNode, useEffect, useRef, useState } from 'react';

const ANCHO_HOJA = 816; // carta a 96 ppp
const ALTO_HOJA = 1056;

// Muestra la hoja carta completa aunque la pantalla sea angosta (celular): la reduce a lo
// ancho disponible en vez de recortarla. Al imprimir se ignora la escala.
export default function HojaEscalada({ children }: { children: ReactNode }) {
  const caja = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(1);

  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const medir = () => setEscala(Math.min(1, el.clientWidth / ANCHO_HOJA));
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  return (
    <div ref={caja} className="hoja-escalada" style={{ height: ALTO_HOJA * escala }}>
      <div className="hoja-escalada-interior" style={{ transform: `scale(${escala})`, width: ANCHO_HOJA }}>
        {children}
      </div>
    </div>
  );
}
