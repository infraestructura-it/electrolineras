import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { Encabezado, MensajeError, Modal, useDatos } from '@/components/ui';
import { Operador, operadoresApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function OperadoresPage() {
  const { esAdmin } = useAuth();
  const operadores = useDatos(() => operadoresApi.listar());
  const [editando, setEditando] = useState<Operador | 'nuevo' | null>(null);

  const lista = operadores.datos ?? [];

  // Un operador ve y edita solo su empresa.
  if (!esAdmin) {
    const propio = lista[0];
    return (
      <>
        <Encabezado titulo="Mi empresa" descripcion="Datos de tu empresa y la cuenta donde recibes el dinero de las cargas." />
        <MensajeError>{operadores.error}</MensajeError>
        {propio && (
          <section className="superficie" style={{ maxWidth: 640 }}>
            <FormularioOperador operador={propio} esAdmin={false} alGuardar={operadores.recargar} />
          </section>
        )}
      </>
    );
  }

  return (
    <>
      <Encabezado titulo="Empresas" descripcion="Dueñas de electrolineras y cargadores: conjuntos residenciales, centros comerciales, flotas, estaciones.">
        <button className="btn" onClick={() => setEditando('nuevo')}>
          <Plus size={18} /> Nueva empresa
        </button>
      </Encabezado>

      <MensajeError>{operadores.error}</MensajeError>

      <section className="superficie">
        {lista.length ? (
          <div className="tabla-envoltura">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>NIT</th>
                  <th>Contacto</th>
                  <th>Cuenta para dispersión</th>
                  <th className="num">Comisión</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lista.map((op) => (
                  <tr key={op.id}>
                    <td style={{ fontWeight: 600 }}>{op.nombre}</td>
                    <td className="mono">{op.nit || <span className="secundario">—</span>}</td>
                    <td>{op.email_contacto || <span className="secundario">Sin correo</span>}</td>
                    <td>{op.cuenta_beneficiario || <span className="estado alerta">Sin definir</span>}</td>
                    <td className="num">
                      {op.comision_pactada != null ? `${op.comision_pactada} %` : <span className="secundario">por defecto</span>}
                    </td>
                    <td>
                      <button className="btn chico sec" onClick={() => setEditando(op)}>
                        <Pencil size={14} /> Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="vacio">
            <h2>Aún no hay operadores</h2>
            <p>Los operadores también pueden registrarse solos desde la pantalla de inicio de sesión.</p>
          </div>
        )}
      </section>

      {editando && (
        <Modal titulo={editando === 'nuevo' ? 'Nueva empresa' : `Editar ${editando.nombre}`} alCerrar={() => setEditando(null)}>
          <FormularioOperador
            operador={editando === 'nuevo' ? null : editando}
            esAdmin
            alGuardar={() => {
              setEditando(null);
              operadores.recargar();
            }}
          />
        </Modal>
      )}
    </>
  );
}

function FormularioOperador({ operador, esAdmin, alGuardar }: { operador: Operador | null; esAdmin: boolean; alGuardar: () => void }) {
  const [nombre, setNombre] = useState(operador?.nombre ?? '');
  const [email, setEmail] = useState(operador?.email_contacto ?? '');
  const [nit, setNit] = useState(operador?.nit ?? '');
  const [cuenta, setCuenta] = useState(operador?.cuenta_beneficiario ?? '');
  const [comision, setComision] = useState(operador?.comision_pactada != null ? String(operador.comision_pactada) : '');
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [guardando, setGuardando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    setGuardado(false);
    try {
      const datos = { nombre, email_contacto: email, cuenta_beneficiario: cuenta, ...(esAdmin || !operador?.nit ? { nit } : {}) };
      const conComision = esAdmin ? { ...datos, comision_pactada: comision ? Number(comision) : null } : datos;
      if (operador) await operadoresApi.actualizar(operador.id, conComision);
      else await operadoresApi.crear(conComision);
      setGuardado(true);
      alGuardar();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="formulario dos" onSubmit={onSubmit}>
      <div className="campo ancho-completo">
        <label htmlFor="nombre">Nombre</label>
        <input id="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
      </div>
      <div className="campo">
        <label htmlFor="nit">NIT</label>
        <input id="nit" className="mono" placeholder="900123456-7" value={nit} onChange={(e) => setNit(e.target.value)} disabled={!esAdmin && Boolean(operador?.nit)} />
        <span className="ayuda">Identifica a la empresa en su licencia de activación.</span>
      </div>
      <div className="campo">
        <label htmlFor="email">Correo de contacto</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="campo">
        <label htmlFor="cuenta">Cuenta para dispersión</label>
        <input id="cuenta" placeholder="Banco y número de cuenta" value={cuenta} onChange={(e) => setCuenta(e.target.value)} />
      </div>
      <div className="campo">
        <label htmlFor="comision">Comisión de la plataforma (%)</label>
        {esAdmin ? (
          <input id="comision" type="number" min="0" max="100" step="0.01" placeholder="Vacío = la de Configuración" value={comision} onChange={(e) => setComision(e.target.value)} />
        ) : (
          <input id="comision" value={operador?.comision_pactada != null ? `${operador.comision_pactada} %` : 'Comisión por defecto de la plataforma'} disabled />
        )}
        <span className="ayuda">{esAdmin ? 'Se pacta con cada empresa.' : 'La define la plataforma según el acuerdo comercial.'}</span>
      </div>
      <div className="ancho-completo">
        <MensajeError>{error}</MensajeError>
        {guardado && !esAdmin && <div className="mensaje-ok">Datos guardados.</div>}
      </div>
      <div className="ancho-completo acciones">
        <button className="btn" type="submit" disabled={guardando}>
          {guardando ? 'Guardando…' : operador ? 'Guardar cambios' : 'Crear empresa'}
        </button>
      </div>
    </form>
  );
}
