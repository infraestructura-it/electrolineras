import Head from 'next/head';
import { ReactNode } from 'react';
import { Zap } from 'lucide-react';

// Alturas del medidor decorativo: una curva de carga típica (rampa, meseta, descenso).
const CURVA = [28, 46, 70, 92, 100, 100, 98, 94, 80, 58, 36];

export default function AccesoLayout({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="acceso">
      <Head>
        <title>{`${titulo} · Electrolineras`}</title>
      </Head>
      <section className="acceso-arte" aria-hidden="true">
        <div className="app-marca">
          <span className="marca-sello">
            <Zap size={18} strokeWidth={2.5} />
          </span>
          <span className="marca-texto">Electrolineras</span>
        </div>
        <div>
          <div className="acceso-medidor">
            {CURVA.map((h, i) => (
              <span key={i} style={{ height: `${h}%`, opacity: 0.35 + (h / 100) * 0.6 }} />
            ))}
          </div>
          <div className="lema" style={{ marginTop: 28 }}>
            Cada kilovatio, medido y cobrado.
          </div>
          <p className="bajada">
            Administra tus cargadores DC, sigue cada sesión en tiempo real y reparte los ingresos con la
            plataforma sin hojas de cálculo.
          </p>
        </div>
        <div style={{ color: 'var(--tenue)', fontSize: 13 }}>Infraestructura-IT · Bogotá</div>
      </section>
      <section className="acceso-forma">
        <div className="acceso-caja">{children}</div>
      </section>
    </div>
  );
}
