import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { FileText, Square } from 'lucide-react';
import { EstadoSesionBadge, Encabezado, MensajeError, Modal, useDatos } from '@/components/ui';
import { ClienteProforma, formatoCOP, formatoFecha, formatoKwh, proformasApi, SesionCarga, sesionesApi } from '@/lib/api';

const FILTROS: { valor: string; texto: string; incluye: (s: SesionCarga) => boolean }[] = [
  { valor: 'todas', texto: 'Todas', incluye: () => true },
  { valor: 'activas', texto: 'Activas', incluye: (s) => ['iniciando', 'en_curso', 'deteniendo'].includes(s.estado) },
  { valor: 'pendientes', texto: 'Pago pendiente', incluye: (s) => s.estado === 'finalizada' && (!s.pago || s.pago.estado_pago === 'pendiente') },
  { valor: 'fallidas', texto: 'Fallidas', incluye: (s) => s.estado === 'fallida' },
];

export default function SesionesPage() {
  const sesiones = useDatos(() => sesionesApi.listar(), 4000);
  const [filtro, setFiltro] = useState('todas');
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [paraProforma, setParaProforma] = useState<SesionCarga | null>(null);

  async function detener(s: SesionCarga) {
    if (!window.confirm(`¿Detener la carga en ${s.numero_serie}?`)) return;
    try {
      await sesionesApi.finalizar(s.id);
      sesiones.recargar();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const criterio = FILTROS.find((f) => f.valor === filtro)!;
  const texto = busqueda.trim().toLowerCase();
  const lista = (sesiones.datos ?? []).filter(
    (s) => criterio.incluye(s) && (!texto || s.numero_serie.toLowerCase().includes(texto) || s.usuario_id.toLowerCase().includes(texto)),
  );

  return (
    <>
      <Encabezado titulo="Sesiones de carga" descripcion="Cargas iniciadas desde el QR o con tarjeta RFID. Se actualiza cada 4 segundos." />

      <MensajeError>{error ?? sesiones.error}</MensajeError>

      <section className="superficie">
        <div className="superficie-titulo" style={{ flexWrap: 'wrap' }}>
          <div className="acciones" role="group" aria-label="Filtrar sesiones">
            {FILTROS.map((f) => (
              <button key={f.valor} className={`btn chico ${filtro === f.valor ? '' : 'sec'}`} onClick={() => setFiltro(f.valor)} aria-pressed={filtro === f.valor}>
                {f.texto}
              </button>
            ))}
          </div>
          <input
            type="search"
            placeholder="Buscar por cargador o usuario"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            style={{ maxWidth: 280 }}
            aria-label="Buscar sesiones"
          />
        </div>

        {lista.length ? (
          <div className="tabla-envoltura">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Inicio</th>
                  <th>Cargador</th>
                  <th>Usuario</th>
                  <th>Estado</th>
                  <th className="num">Energía</th>
                  <th className="num">Valor</th>
                  <th>Pago</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lista.map((s) => (
                  <tr key={s.id}>
                    <td>
                      {formatoFecha(s.inicio)}
                      <div className="secundario">{s.origen === 'rfid' ? 'Tarjeta RFID' : s.origen === 'panel' ? 'Consola OCPP' : 'App (QR)'}{s.medicion_simulada ? ', medición simulada' : ''}</div>
                    </td>
                    <td className="mono">{s.numero_serie}</td>
                    <td>{s.usuario_id}</td>
                    <td>
                      <EstadoSesionBadge estado={s.estado} />
                      {s.motivo && s.estado === 'fallida' && <div className="secundario">{s.motivo}</div>}
                    </td>
                    <td className="num">
                      {formatoKwh(s.kwh_consumidos)}
                      {s.potencia_kw != null && s.estado === 'en_curso' && <div className="secundario">{s.potencia_kw} kW</div>}
                    </td>
                    <td className="num">
                      {formatoCOP(s.costo_total ?? s.costo_estimado)}
                      {s.costo_total == null && s.estado !== 'fallida' && <div className="secundario">estimado</div>}
                    </td>
                    <td>
                      {s.pago ? (
                        <span className={`estado ${s.pago.estado_pago === 'aprobado' ? 'ok' : s.pago.estado_pago === 'rechazado' ? 'falla' : 'alerta'}`}>
                          {s.pago.estado_pago === 'pendiente' ? 'Pendiente' : s.pago.estado_pago === 'aprobado' ? 'Aprobado' : 'Rechazado'}
                        </span>
                      ) : s.estado === 'finalizada' ? (
                        <span className="estado alerta">Sin pagar</span>
                      ) : (
                        <span className="secundario">—</span>
                      )}
                    </td>
                    <td>
                      <div className="acciones" style={{ flexWrap: 'nowrap' }}>
                        {['en_curso', 'iniciando'].includes(s.estado) && (
                          <button className="btn chico peligro" onClick={() => detener(s)}>
                            <Square size={13} /> Detener
                          </button>
                        )}
                        {s.proforma ? (
                          <Link className="btn chico sec" href={`/proformas/${s.proforma.id}`}>
                            <FileText size={14} /> {s.proforma.numero}
                          </Link>
                        ) : (
                          s.estado === 'finalizada' &&
                          (s.costo_total ?? 0) > 0 && (
                            <button className="btn chico" onClick={() => setParaProforma(s)}>
                              <FileText size={14} /> Proforma
                            </button>
                          )
                        )}
                        <Link className="btn chico sec" href={`/carga/${s.id}`} target="_blank">
                          Ver como usuario
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="vacio">
            <h2>{sesiones.datos?.length ? 'Ninguna sesión con este filtro' : 'Aún no hay sesiones'}</h2>
            <p>Abre el QR de un cargador desde la página Cargadores para iniciar una carga de prueba.</p>
          </div>
        )}
      </section>

      {paraProforma && (
        <Modal
          titulo={`Proforma de la carga en ${paraProforma.numero_serie}`}
          descripcion={`${formatoKwh(paraProforma.kwh_consumidos)} por ${formatoCOP(paraProforma.costo_total ?? 0)}. Se le asigna el siguiente consecutivo.`}
          alCerrar={() => setParaProforma(null)}
        >
          <FormularioProforma sesion={paraProforma} />
        </Modal>
      )}
    </>
  );
}

const CLIENTE_VACIO: ClienteProforma = { nombre: '', documento: '', direccion: '', ciudad: '', telefono: '', correo: '' };

function FormularioProforma({ sesion }: { sesion: SesionCarga }) {
  const router = useRouter();
  const [consumidorFinal, setConsumidorFinal] = useState(true);
  const [cliente, setCliente] = useState<ClienteProforma>({
    ...CLIENTE_VACIO,
    correo: sesion.usuario_id.includes('@') ? sesion.usuario_id : '',
  });
  const [retenciones, setRetenciones] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const cambiar = (campo: keyof ClienteProforma) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setCliente((c) => ({ ...c, [campo]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const p = await proformasApi.generar({
        sesion_id: sesion.id,
        cliente: consumidorFinal ? undefined : cliente,
        aplicar_retenciones: !consumidorFinal && retenciones,
      });
      router.push(`/proformas/${p.id}`);
    } catch (e) {
      setError((e as Error).message);
      setEnviando(false);
    }
  }

  return (
    <form className="formulario dos" onSubmit={onSubmit}>
      <label className="interruptor ancho-completo">
        <input type="checkbox" checked={consumidorFinal} onChange={(e) => setConsumidorFinal(e.target.checked)} />
        <span>
          <span className="texto">A nombre de consumidor final</span>
          <span className="ayuda">Desactívalo para emitirla con los datos de una empresa o persona (NIT o CC).</span>
        </span>
      </label>

      {!consumidorFinal && (
        <>
          <div className="campo ancho-completo">
            <label htmlFor="cli-nombre">Nombre o razón social</label>
            <input id="cli-nombre" value={cliente.nombre} onChange={cambiar('nombre')} required />
          </div>
          <div className="campo">
            <label htmlFor="cli-doc">NIT o CC</label>
            <input id="cli-doc" placeholder="900298074-9" inputMode="numeric" value={cliente.documento} onChange={cambiar('documento')} required />
          </div>
          <div className="campo">
            <label htmlFor="cli-tel">Teléfono</label>
            <input id="cli-tel" value={cliente.telefono} onChange={cambiar('telefono')} />
          </div>
          <div className="campo">
            <label htmlFor="cli-dir">Dirección</label>
            <input id="cli-dir" value={cliente.direccion} onChange={cambiar('direccion')} />
          </div>
          <div className="campo">
            <label htmlFor="cli-ciudad">Ciudad</label>
            <input id="cli-ciudad" value={cliente.ciudad} onChange={cambiar('ciudad')} />
          </div>
          <div className="campo ancho-completo">
            <label htmlFor="cli-correo">Correo</label>
            <input id="cli-correo" type="email" value={cliente.correo} onChange={cambiar('correo')} />
          </div>
          <label className="interruptor ancho-completo">
            <input type="checkbox" checked={retenciones} onChange={(e) => setRetenciones(e.target.checked)} />
            <span>
              <span className="texto">El cliente practica retenciones</span>
              <span className="ayuda">Aplica RteFuente, ReteIVA y ReteICA con los porcentajes de Configuración.</span>
            </span>
          </label>
        </>
      )}

      <div className="ancho-completo">
        <MensajeError>{error}</MensajeError>
      </div>
      <div className="ancho-completo acciones">
        <button className="btn" type="submit" disabled={enviando}>
          <FileText size={16} /> {enviando ? 'Emitiendo…' : 'Emitir proforma'}
        </button>
      </div>
    </form>
  );
}
