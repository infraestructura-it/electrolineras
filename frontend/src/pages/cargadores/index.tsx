import { useEffect, useState } from 'react';
import { Cable, Pencil, Plus, QrCode, Trash2 } from 'lucide-react';
import QrCargador from '@/components/QrCargador';
import { EstadoCargadorBadge, Encabezado, MensajeError, Modal, useDatos } from '@/components/ui';
import {
  Cargador,
  cargadoresApi,
  configuracionApi,
  ConexionOcpp,
  Electrolinera,
  electrolineasApi,
  EstadoCargador,
  VersionOcpp,
  formatoCOP,
  formatoKwh,
  haceCuanto,
  ocppApi,
  operadoresApi,
  sesionesApi,
  urlOcpp,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';

type Dialogo =
  | { tipo: 'nuevo' }
  | { tipo: 'editar'; cargador: Cargador }
  | { tipo: 'qr'; cargador: Cargador }
  | { tipo: 'ocpp'; cargador: Cargador }
  | null;

export default function CargadoresPage() {
  const { esAdmin, puedeGestionar } = useAuth();
  const cargadores = useDatos(() => cargadoresApi.listar(), 15000);
  const electrolineras = useDatos(() => electrolineasApi.listar());
  const conexiones = useDatos(() => ocppApi.conexiones(), 5000);
  const sesiones = useDatos(() => sesionesApi.listar(), 5000);
  const operadores = useDatos(() => operadoresApi.listar());
  const [baseQr, setBaseQr] = useState('');
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    configuracionApi
      .publica()
      .then((c) => setBaseQr(c.url_publica_app || window.location.origin))
      .catch(() => setBaseQr(window.location.origin));
  }, []);

  const conexionDe = (serie: string) => conexiones.datos?.find((c) => c.numero_serie === serie);
  const sesionActivaDe = (serie: string) =>
    sesiones.datos?.find((s) => s.numero_serie === serie && ['iniciando', 'en_curso', 'deteniendo'].includes(s.estado));
  const urlQr = (c: Cargador) => `${baseQr}/c/${encodeURIComponent(c.numero_serie)}`;
  const nombreOperador = (id: string) => operadores.datos?.find((o) => o.id === id)?.nombre ?? '';
  const nombreSitio = (id: string | null) => electrolineras.datos?.find((e) => e.id === id)?.nombre ?? null;

  async function eliminar(c: Cargador) {
    if (!window.confirm(`¿Eliminar el cargador ${c.numero_serie}? Su QR dejará de funcionar.`)) return;
    try {
      await cargadoresApi.eliminar(c.numero_serie);
      cargadores.recargar();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const lista = cargadores.datos ?? [];

  return (
    <>
      <Encabezado
        titulo="Cargadores"
        descripcion="Cada cargador tiene su código QR para los usuarios y una dirección OCPP para conectarlo a la plataforma."
      >
        {puedeGestionar && (
          <button className="btn" onClick={() => setDialogo({ tipo: 'nuevo' })}>
            <Plus size={18} /> Registrar cargador
          </button>
        )}
      </Encabezado>

      <MensajeError>{error ?? cargadores.error}</MensajeError>

      {cargadores.datos && lista.length === 0 && (
        <div className="superficie vacio">
          <h2>Aún no hay cargadores</h2>
          <p>Registra el número de serie que configuraste en el equipo como pile_number_master.</p>
          {puedeGestionar && (
            <button className="btn" onClick={() => setDialogo({ tipo: 'nuevo' })}>
              <Plus size={18} /> Registrar cargador
            </button>
          )}
        </div>
      )}

      <div className="cargadores">
        {lista.map((c) => {
          const conexion = conexionDe(c.numero_serie);
          const activa = sesionActivaDe(c.numero_serie);
          const clase = c.estado === 'en_falla' ? 'falla' : activa ? 'cargando' : c.estado === 'activo' ? 'disponible' : '';
          return (
            <article className={`cargador ${clase}`} key={c.id}>
              <div className="cargador-cabeza">
                <div style={{ minWidth: 0 }}>
                  <div className="cargador-serie">{c.numero_serie}</div>
                  <div className="cargador-lugar">
                    {[nombreSitio(c.electrolinera_id) ?? 'Sin electrolinera', c.ubicacion].filter(Boolean).join(' · ')}
                  </div>
                  {esAdmin && <div className="cargador-lugar">{nombreOperador(c.operador_id)}</div>}
                </div>
                <EstadoCargadorBadge estado={c.estado} cargando={Boolean(activa)} />
              </div>

              <div className="cargador-datos">
                <div>
                  <div className="dato-etiqueta">Tarifa</div>
                  <div className="dato-valor">{c.tarifa_por_kwh != null ? `${formatoCOP(c.tarifa_por_kwh)}/kWh` : 'Sin tarifa'}</div>
                </div>
                <div>
                  <div className="dato-etiqueta">{activa ? 'Carga actual' : 'Modelo'}</div>
                  <div className="dato-valor">{activa ? formatoKwh(activa.kwh_consumidos) : `${c.modelo} · ${c.potencia_kw} kW`}</div>
                </div>
              </div>

              <div className="conexion">
                <span className={`led ${conexion ? 'encendido' : ''}`} aria-hidden="true" />
                {conexion ? `En línea por OCPP ${conexion.version}` : `Sin conexión OCPP${c.version_ocpp !== 'auto' ? ` (${c.version_ocpp})` : ''}`}
                {conexion && <span className="secundario">{haceCuanto(conexion.ultimo_mensaje)}</span>}
              </div>

              <div className="cargador-pie">
                <button className="btn chico" onClick={() => setDialogo({ tipo: 'qr', cargador: c })}>
                  <QrCode size={16} /> Código QR
                </button>
                {puedeGestionar && (
                  <button className="btn chico sec" onClick={() => setDialogo({ tipo: 'editar', cargador: c })}>
                    <Pencil size={15} /> Editar
                  </button>
                )}
                <button className="btn chico sec" onClick={() => setDialogo({ tipo: 'ocpp', cargador: c })}>
                  <Cable size={15} /> Conexión
                </button>
                {puedeGestionar && (
                  <button className="btn-icono" onClick={() => eliminar(c)} aria-label={`Eliminar ${c.numero_serie}`} title="Eliminar">
                    <Trash2 size={17} />
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {dialogo?.tipo === 'qr' && (
        <Modal
          titulo={`QR del cargador ${dialogo.cargador.numero_serie}`}
          descripcion="Imprímelo y pégalo junto al cargador. La misma URL va en el equipo para que su pantalla muestre este QR."
          alCerrar={() => setDialogo(null)}
        >
          <QrCargador cargador={dialogo.cargador} url={urlQr(dialogo.cargador)} />
        </Modal>
      )}

      {dialogo?.tipo === 'ocpp' && (
        <Modal
          titulo="Conectar el cargador por OCPP"
          descripcion="Valores para la pantalla Basic Settings del MDXDC3001. Después: Save y About → System reset."
          alCerrar={() => setDialogo(null)}
        >
          <DatosOcpp cargador={dialogo.cargador} conexion={conexionDe(dialogo.cargador.numero_serie)} urlQr={urlQr(dialogo.cargador)} />
        </Modal>
      )}

      {(dialogo?.tipo === 'nuevo' || dialogo?.tipo === 'editar') && (
        <Modal
          titulo={dialogo.tipo === 'nuevo' ? 'Registrar cargador' : `Editar ${dialogo.cargador.numero_serie}`}
          alCerrar={() => setDialogo(null)}
        >
          <FormularioCargador
            cargador={dialogo.tipo === 'editar' ? dialogo.cargador : null}
            operadores={esAdmin ? operadores.datos ?? [] : null}
            electrolineras={electrolineras.datos ?? []}
            alGuardar={() => {
              setDialogo(null);
              cargadores.recargar();
            }}
          />
        </Modal>
      )}
    </>
  );
}

function DatosOcpp({ cargador, conexion, urlQr }: { cargador: Cargador; conexion?: ConexionOcpp; urlQr: string }) {
  const filas: [string, string, string][] = [
    ['domain_master', urlOcpp(), 'Dirección del gateway OCPP de la plataforma'],
    ['pile_number_master', cargador.numero_serie, 'Identificador del cargador (igual al número de serie registrado)'],
    ['qr_code_type', '0', 'QR personalizado (Device Configuration)'],
    ['QR code', urlQr, 'Basic Settings, página 2'],
  ];
  return (
    <>
      <table className="tabla">
        <tbody>
          {filas.map(([clave, valor, ayuda]) => (
            <tr key={clave}>
              <td style={{ width: 150 }}>
                <code>{clave}</code>
              </td>
              <td>
                <code style={{ wordBreak: 'break-all' }}>{valor}</code>
                <div className="secundario">{ayuda}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="superficie" style={{ marginTop: 16, background: 'var(--tinta-2)' }}>
        <div className="conexion">
          <span className={`led ${conexion ? 'encendido' : ''}`} aria-hidden="true" />
          {conexion ? (
            <span>
              Conectado desde {new Date(conexion.conectado_desde).toLocaleString('es-CO')}
              {' · '}OCPP {conexion.version}
              {conexion.boot?.firmwareVersion && <> · firmware {conexion.boot.firmwareVersion}</>}
            </span>
          ) : (
            <span>El cargador aún no se ha conectado. De fábrica apunta a la plataforma del fabricante (wss://ocpp.sswl.com): cámbialo antes de darle internet.</span>
          )}
        </div>
      </div>
    </>
  );
}

function FormularioCargador({
  cargador,
  operadores,
  electrolineras,
  alGuardar,
}: {
  cargador: Cargador | null;
  operadores: { id: string; nombre: string }[] | null; // null: el usuario es de una empresa
  electrolineras: Electrolinera[];
  alGuardar: () => void;
}) {
  const [electrolineraId, setElectrolineraId] = useState(cargador?.electrolinera_id ?? '');
  const [version, setVersion] = useState<VersionOcpp>(cargador?.version_ocpp ?? 'auto');
  const [potencia, setPotencia] = useState(String(cargador?.potencia_kw ?? 30));
  const [numeroSerie, setNumeroSerie] = useState(cargador?.numero_serie ?? '');
  const [modelo, setModelo] = useState(cargador?.modelo ?? 'MDXDC3001');
  const [operadorId, setOperadorId] = useState(cargador?.operador_id ?? '');
  const [ubicacion, setUbicacion] = useState(cargador?.ubicacion ?? '');
  const [tarifa, setTarifa] = useState(cargador?.tarifa_por_kwh != null ? String(cargador.tarifa_por_kwh) : '');
  const [estado, setEstado] = useState<EstadoCargador>(cargador?.estado ?? 'activo');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      const tarifa_por_kwh = tarifa ? Number(tarifa) : null;
      const comunes = {
        ubicacion,
        tarifa_por_kwh,
        electrolinera_id: electrolineraId || null,
        version_ocpp: version,
        potencia_kw: Number(potencia),
      };
      if (cargador) {
        await cargadoresApi.actualizar(cargador.numero_serie, { ...comunes, estado });
      } else {
        await cargadoresApi.registrar({ ...comunes, numero_serie: numeroSerie, modelo, operador_id: operadorId || undefined });
      }
      alGuardar();
    } catch (e) {
      setError((e as Error).message);
      setGuardando(false);
    }
  }

  return (
    <form className="formulario dos" onSubmit={onSubmit}>
      {!cargador && (
        <>
          <div className="campo">
            <label htmlFor="serie">Número de serie</label>
            <input id="serie" className="mono" placeholder="MDX20260715001" value={numeroSerie} onChange={(e) => setNumeroSerie(e.target.value)} required />
            <span className="ayuda">El mismo pile_number_master del equipo.</span>
          </div>
          <div className="campo">
            <label htmlFor="modelo">Modelo</label>
            <input id="modelo" value={modelo} onChange={(e) => setModelo(e.target.value)} required />
          </div>
          {operadores && !electrolineraId && (
            <div className="campo ancho-completo">
              <label htmlFor="operador">Empresa dueña</label>
              <select id="operador" value={operadorId} onChange={(e) => setOperadorId(e.target.value)} required>
                <option value="">Selecciona la empresa (o elige una electrolinera)</option>
                {operadores.map((op) => (
                  <option key={op.id} value={op.id}>
                    {op.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}
      <div className="campo">
        <label htmlFor="electrolinera">Electrolinera</label>
        <select id="electrolinera" value={electrolineraId} onChange={(e) => setElectrolineraId(e.target.value)}>
          <option value="">Sin electrolinera</option>
          {electrolineras
            .filter((e) => !cargador || e.operador_id === cargador.operador_id)
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
        </select>
        <span className="ayuda">Define su ubicación en el mapa de los conductores.</span>
      </div>
      <div className="campo">
        <label htmlFor="ubicacion">Punto dentro del sitio</label>
        <input id="ubicacion" placeholder="Bahía 2, sótano 1" value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} />
        <span className="ayuda">La ve el usuario al escanear el QR.</span>
      </div>
      <div className="campo">
        <label htmlFor="version">Versión OCPP</label>
        <select id="version" value={version} onChange={(e) => setVersion(e.target.value as VersionOcpp)}>
          <option value="auto">Automática (la que ofrezca el equipo)</option>
          <option value="1.6">Solo OCPP 1.6J</option>
          <option value="2.0.1">Solo OCPP 2.0.1</option>
        </select>
        <span className="ayuda">El MDXDC3001 usa 1.6J.</span>
      </div>
      <div className="campo">
        <label htmlFor="potencia">Potencia nominal (kW)</label>
        <input id="potencia" type="number" min="1" max="1000" step="0.1" value={potencia} onChange={(e) => setPotencia(e.target.value)} required />
      </div>
      <div className="campo">
        <label htmlFor="tarifa">Tarifa por kWh (COP)</label>
        <input id="tarifa" type="number" min="1" step="1" placeholder="1500" value={tarifa} onChange={(e) => setTarifa(e.target.value)} />
        <span className="ayuda">Sin tarifa el cargador no acepta cargas.</span>
      </div>
      {cargador && (
        <div className="campo">
          <label htmlFor="estado">Estado</label>
          <select id="estado" value={estado} onChange={(e) => setEstado(e.target.value as EstadoCargador)}>
            <option value="activo">Disponible</option>
            <option value="inactivo">Inactivo</option>
            <option value="en_falla">En falla</option>
          </select>
        </div>
      )}
      <div className="ancho-completo">
        <MensajeError>{error}</MensajeError>
      </div>
      <div className="ancho-completo acciones">
        <button className="btn" type="submit" disabled={guardando}>
          {guardando ? 'Guardando…' : cargador ? 'Guardar cambios' : 'Registrar cargador'}
        </button>
      </div>
    </form>
  );
}
