import { QRCodeSVG } from 'qrcode.react';
import type { Proforma } from '@/lib/api';
import { formatoPesos } from '@/lib/api';

// Representación impresa de la proforma (prefactura). Sigue la estructura de la factura
// electrónica de referencia: encabezado con QR, datos del cliente, texto legal, detalle,
// totales con retenciones, valor en letras y firmas. Es un documento en papel: colores
// fijos, independientes del tema del panel.

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric' });

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const cantidad = (n: number) => n.toLocaleString('es-CO', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export default function DocumentoProforma({ proforma: p, urlQr }: { proforma: Proforma; urlQr: string }) {
  const e = p.emisor;
  const t = p.totales;
  const filasTotales: [string, number][] = [
    ['Total general', t.total_general],
    ['Descuento', t.descuento],
    ['Subtotal', t.subtotal],
    [`IVA ${t.iva_porcentaje.toLocaleString('es-CO')} %`, t.iva],
    ['Total proforma', t.total],
    ['RteFuente', t.retefuente],
    ['ReteIVA', t.reteiva],
    ['ReteICA', t.reteica],
  ];

  return (
    <article className={`documento-proforma ${p.estado === 'anulada' ? 'anulada' : ''}`} aria-label={`Proforma ${p.numero}`}>
      {p.estado === 'anulada' && (
        <div className="dp-sello" aria-hidden="true">
          ANULADA
        </div>
      )}

      <header className="dp-cabecera">
        <div className="dp-qr">
          <QRCodeSVG value={urlQr} size={112} marginSize={0} level="M" title={`Verificar proforma ${p.numero}`} />
        </div>
        <div className="dp-emisor">
          <div className="dp-razon">{e.razon_social}</div>
          {e.nit && <div className="dp-nit">NIT {e.nit}</div>}
        </div>
        <div className="dp-contacto">
          {e.direccion && <div>{[e.direccion, e.ciudad].filter(Boolean).join(' ').toUpperCase()}</div>}
          {e.telefono && <div>Tel: {e.telefono}</div>}
          {e.correo && <div>{e.correo}</div>}
          {e.sitio_web && <div>{e.sitio_web.toUpperCase()}</div>}
        </div>
        <div className="dp-tipo">
          <div className="dp-tipo-titulo">PROFORMA</div>
          <div className="dp-tipo-sub">PREFACTURA DE VENTA</div>
          <div className="dp-numero">
            {p.prefijo} - {String(p.consecutivo).padStart(6, '0')}
          </div>
        </div>
      </header>

      <div className="dp-verificacion">
        <span>Código de verificación:</span> <strong>{p.codigo_verificacion}</strong>
        <span className="dp-verificacion-ayuda">Escanee el código QR para consultar este documento.</span>
      </div>

      <section className="dp-bloque-cliente">
        <table className="dp-tabla dp-cliente">
          <tbody>
            <tr>
              <th>Cliente</th>
              <td colSpan={2}>{p.cliente.nombre}</td>
            </tr>
            <tr>
              <th>NIT / CC</th>
              <td colSpan={2}>{p.cliente.documento}</td>
            </tr>
            <tr className="dp-sub">
              <th>Dirección</th>
              <th>Ciudad</th>
              <th>Teléfono</th>
            </tr>
            <tr>
              <td>{p.cliente.direccion || '—'}</td>
              <td>{p.cliente.ciudad || '—'}</td>
              <td>{p.cliente.telefono || '—'}</td>
            </tr>
            <tr className="dp-sub">
              <th colSpan={2}>Fecha de emisión</th>
              <th>Fecha de vencimiento</th>
            </tr>
            <tr>
              <td className="dp-centro" colSpan={2}>
                {fechaHora(p.fecha_emision)}
              </td>
              <td className="dp-centro">{fecha(p.fecha_vencimiento)}</td>
            </tr>
          </tbody>
        </table>

        <div className="dp-legal-col">
          <div className="dp-legal">
            {e.texto_legal || 'Documento soporte de cobro del servicio de carga de vehículos eléctricos.'}
            {p.cliente.correo && <div className="dp-legal-correo">Enviado a: {p.cliente.correo}</div>}
          </div>
          <table className="dp-tabla">
            <tbody>
              <tr className="dp-sub">
                <th>Vendedor</th>
                <th>Forma de pago</th>
              </tr>
              <tr>
                <td>{p.vendedor}</td>
                <td className="dp-centro">{p.forma_pago}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="dp-detalle">
        <table className="dp-tabla dp-items">
          <thead>
            <tr>
              <th style={{ width: '15%' }}>Código</th>
              <th>Producto</th>
              <th style={{ width: '13%' }}>Cantidad</th>
              <th style={{ width: '15%' }}>Precio unitario</th>
              <th style={{ width: '15%' }}>Valor total</th>
            </tr>
          </thead>
          <tbody>
            {p.lineas.map((l, i) => (
              <tr key={i}>
                <td>{l.codigo}</td>
                <td>
                  {l.descripcion.toUpperCase()}
                  <div className="dp-detalle-linea">{l.detalle}</div>
                </td>
                <td className="dp-num">
                  {cantidad(l.cantidad)} {l.unidad}
                </td>
                <td className="dp-num">{formatoPesos(l.precio_unitario)}</td>
                <td className="dp-num">{formatoPesos(l.valor_total)}</td>
              </tr>
            ))}
            <tr className="dp-relleno" aria-hidden="true">
              <td />
              <td />
              <td />
              <td />
              <td />
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <th>Total líneas:</th>
              <td colSpan={4}>{p.lineas.length}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      <section className="dp-pie-valores">
        <div className="dp-letras">
          <div className="dp-letras-etiqueta">Valor en letras:</div>
          <div className="dp-letras-valor">{p.valor_en_letras}</div>
        </div>
        <table className="dp-tabla dp-totales">
          <tbody>
            {filasTotales.map(([etiqueta, valor]) => (
              <tr key={etiqueta} className={etiqueta === 'Total proforma' ? 'dp-fuerte' : undefined}>
                <th>{etiqueta}:</th>
                <td className="dp-num">{formatoPesos(valor)}</td>
              </tr>
            ))}
            <tr className="dp-fuerte dp-neto">
              <th>Total menos retenciones:</th>
              <td className="dp-num">{formatoPesos(t.total_neto)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="dp-firmas">
        <div className="dp-firma">Firma autorizada</div>
        <div className="dp-firma">Firma recibido - CC o NIT</div>
      </section>

      <footer className="dp-pie">
        <div>
          Punto de carga: {p.punto_carga.operador}
          {p.punto_carga.ubicacion ? `, ${p.punto_carga.ubicacion}` : ''} · Cargador {p.punto_carga.numero_serie} ({p.punto_carga.modelo})
        </div>
        <div>Generado por Electrolineras · {p.origen === 'automatica' ? 'Emitida al pagar en la app' : 'Emitida desde el panel'}</div>
        {p.anulacion && (
          <div className="dp-anulacion">
            Anulada el {fechaHora(p.anulacion.fecha)} por {p.anulacion.usuario}. Motivo: {p.anulacion.motivo}
          </div>
        )}
        <div className="dp-nota">{e.nota_pie}</div>
      </footer>
    </article>
  );
}
