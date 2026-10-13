import Head from 'next/head';
import { useRouter } from 'next/router';
import { Printer, Zap } from 'lucide-react';
import DocumentoProforma from '@/components/DocumentoProforma';
import HojaEscalada from '@/components/HojaEscalada';
import { MensajeError, useDatos } from '@/components/ui';
import { formatoCOP, proformasApi } from '@/lib/api';

// Página que abre el QR de una proforma: muestra el documento sin login.
export default function ProformaPublica() {
  const router = useRouter();
  const codigo = typeof router.query.codigo === 'string' ? router.query.codigo : null;
  const proforma = useDatos(() => (codigo ? proformasApi.verificar(codigo) : Promise.resolve(null)), undefined, codigo);
  const p = proforma.datos;

  return (
    <div className="pagina-publica">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{p ? `Proforma ${p.numero}` : 'Proforma · Electrolineras'}</title>
      </Head>

      <div className="resumen-publico">
        <span className="app-marca">
          <span className="marca-sello" aria-hidden="true">
            <Zap size={16} strokeWidth={2.5} />
          </span>
          Electrolineras
        </span>
        {p && (
          <div className="acciones">
            <span className={`estado ${p.estado === 'vigente' ? 'ok' : 'falla'}`}>
              {p.numero} · {p.estado === 'vigente' ? 'Vigente' : 'Anulada'} · {formatoCOP(p.totales.total)}
            </span>
            <button className="btn chico" onClick={() => window.print()}>
              <Printer size={15} /> Imprimir o guardar PDF
            </button>
          </div>
        )}
      </div>

      {proforma.error && (
        <div className="superficie" style={{ width: 'min(560px, 100%)' }}>
          <MensajeError>{proforma.error}. Revisa el código del QR.</MensajeError>
        </div>
      )}

      {p && (
        <HojaEscalada>
          <DocumentoProforma proforma={p} urlQr={typeof window !== 'undefined' ? window.location.href : ''} />
        </HojaEscalada>
      )}
    </div>
  );
}
