import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ArrowLeft, Ban, Printer } from 'lucide-react';
import DocumentoProforma from '@/components/DocumentoProforma';
import HojaEscalada from '@/components/HojaEscalada';
import { MensajeError, Modal, useBasePublica, useDatos } from '@/components/ui';
import { proformasApi, urlVerificacionProforma } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function VerProforma() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : null;
  const { esAdmin } = useAuth();
  const base = useBasePublica();
  const proforma = useDatos(() => (id ? proformasApi.obtener(id) : Promise.resolve(null)), undefined, id);
  const [anulando, setAnulando] = useState(false);

  const p = proforma.datos;

  return (
    <>
      <div className="barra-documento">
        <Link className="btn sec" href="/proformas">
          <ArrowLeft size={16} /> Proformas
        </Link>
        {p && (
          <div className="acciones">
            <button className="btn" onClick={() => window.print()}>
              <Printer size={16} /> Imprimir o guardar PDF
            </button>
            {esAdmin && p.estado === 'vigente' && (
              <button className="btn peligro" onClick={() => setAnulando(true)}>
                <Ban size={16} /> Anular
              </button>
            )}
          </div>
        )}
      </div>

      <MensajeError>{proforma.error}</MensajeError>

      {p && base && (
        <HojaEscalada>
          <DocumentoProforma proforma={p} urlQr={urlVerificacionProforma(base, p.codigo_verificacion)} />
        </HojaEscalada>
      )}

      {anulando && p && (
        <Modal
          titulo={`Anular ${p.numero}`}
          descripcion="La proforma queda marcada como anulada y su número no se vuelve a usar. Después puedes emitir una nueva para la misma sesión."
          alCerrar={() => setAnulando(false)}
        >
          <FormularioAnular
            id={p.id}
            alAnular={() => {
              setAnulando(false);
              proforma.recargar();
            }}
          />
        </Modal>
      )}
    </>
  );
}

function FormularioAnular({ id, alAnular }: { id: string; alAnular: () => void }) {
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      await proformasApi.anular(id, motivo);
      alAnular();
    } catch (e) {
      setError((e as Error).message);
      setEnviando(false);
    }
  }

  return (
    <form className="formulario" onSubmit={onSubmit}>
      <div className="campo">
        <label htmlFor="motivo">Motivo de la anulación</label>
        <input id="motivo" placeholder="Datos del cliente errados" value={motivo} onChange={(e) => setMotivo(e.target.value)} minLength={5} required />
      </div>
      <MensajeError>{error}</MensajeError>
      <button className="btn peligro" type="submit" disabled={enviando}>
        {enviando ? 'Anulando…' : 'Anular proforma'}
      </button>
    </form>
  );
}
