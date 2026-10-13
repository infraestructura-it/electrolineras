import { useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Check, Copy, Download, Printer, Zap } from 'lucide-react';
import type { Cargador } from '@/lib/api';
import { formatoCOP } from '@/lib/api';

// Hoja del QR lista para imprimir y pegar en el cargador. La misma URL va en el equipo
// (Basic Settings → QR code, con qr_code_type = 0) para que la pantalla muestre el mismo QR.
export default function QrCargador({ cargador, url }: { cargador: Cargador; url: string }) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const [copiado, setCopiado] = useState(false);

  function descargar() {
    const canvas = lienzo.current;
    if (!canvas) return;
    const enlace = document.createElement('a');
    enlace.href = canvas.toDataURL('image/png');
    enlace.download = `qr-${cargador.numero_serie}.png`;
    enlace.click();
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      window.prompt('Copia la URL del QR', url);
    }
  }

  return (
    <>
      <div className="qr-hoja">
        <div className="qr-titulo" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Zap size={20} color="#c98500" strokeWidth={2.5} aria-hidden="true" /> Carga tu vehículo
        </div>
        <QRCodeCanvas ref={lienzo} value={url} size={240} marginSize={2} level="M" title={`QR del cargador ${cargador.numero_serie}`} />
        <div className="qr-texto">
          Escanea con la cámara del celular, conecta la pistola CCS2 y paga desde tu teléfono.
          {cargador.tarifa_por_kwh != null && ` Tarifa: ${formatoCOP(cargador.tarifa_por_kwh)} por kWh.`}
        </div>
        <div className="qr-serie">{cargador.numero_serie}</div>
      </div>

      <div className="url-copiable">
        <code title={url}>{url}</code>
        <button className="btn chico sec" onClick={copiar}>
          {copiado ? <Check size={15} /> : <Copy size={15} />} {copiado ? 'Copiada' : 'Copiar'}
        </button>
      </div>

      <div className="acciones" style={{ marginTop: 14 }}>
        <button className="btn" onClick={descargar}>
          <Download size={17} /> Descargar PNG
        </button>
        <button className="btn sec" onClick={() => window.print()}>
          <Printer size={17} /> Imprimir
        </button>
      </div>
    </>
  );
}
