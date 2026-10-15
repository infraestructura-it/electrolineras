import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Encabezado, MensajeError, Modal, useDatos } from '@/components/ui';
import { electrolineasApi, Zona, zonasApi } from '@/lib/api';

// Zonas geográficas que agrupan electrolineras (solo administrador de plataforma).
export default function ZonasPage() {
  const zonas = useDatos(() => zonasApi.listar());
  const electrolineras = useDatos(() => electrolineasApi.listar());
  const [dialogo, setDialogo] = useState<{ zona: Zona | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cuantas = (id: string) => (electrolineras.datos ?? []).filter((e) => e.zona_id === id).length;

  async function eliminar(z: Zona) {
    if (!window.confirm(`¿Eliminar la zona ${z.nombre}?`)) return;
    try {
      await zonasApi.eliminar(z.id);
      zonas.recargar();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <Encabezado
        titulo="Zonas"
        descripcion="Agrupan las electrolineras por región. Un operario con zona asignada solo ve las electrolineras de su zona."
      >
        <button className="btn" onClick={() => setDialogo({ zona: null })}>
          <Plus size={18} /> Nueva zona
        </button>
      </Encabezado>
      <MensajeError>{error ?? zonas.error}</MensajeError>
      <section className="superficie">
        {zonas.datos && zonas.datos.length === 0 ? (
          <div className="vacio">
            <h2>Aún no hay zonas</h2>
            <p>Por ejemplo: Bogotá Norte, Bogotá Sur, Eje Cafetero.</p>
          </div>
        ) : (
          <div className="tabla-envoltura">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Zona</th>
                  <th>Descripción</th>
                  <th>Electrolineras</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(zonas.datos ?? []).map((z) => (
                  <tr key={z.id}>
                    <td style={{ fontWeight: 600 }}>{z.nombre}</td>
                    <td className="secundario">{z.descripcion ?? '—'}</td>
                    <td>{cuantas(z.id)}</td>
                    <td>
                      <div className="acciones" style={{ flexWrap: 'nowrap' }}>
                        <button className="btn chico sec" onClick={() => setDialogo({ zona: z })}>
                          <Pencil size={14} /> Editar
                        </button>
                        <button className="btn-icono" onClick={() => eliminar(z)} aria-label={`Eliminar ${z.nombre}`} title="Eliminar">
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {dialogo && (
        <Modal titulo={dialogo.zona ? `Editar ${dialogo.zona.nombre}` : 'Nueva zona'} alCerrar={() => setDialogo(null)}>
          <FormularioZona
            zona={dialogo.zona}
            alGuardar={() => {
              setDialogo(null);
              zonas.recargar();
            }}
          />
        </Modal>
      )}
    </>
  );
}

function FormularioZona({ zona, alGuardar }: { zona: Zona | null; alGuardar: () => void }) {
  const [nombre, setNombre] = useState(zona?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(zona?.descripcion ?? '');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (zona) await zonasApi.actualizar(zona.id, { nombre, descripcion });
      else await zonasApi.crear({ nombre, descripcion });
      alGuardar();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <form className="formulario" onSubmit={onSubmit}>
      <div className="campo">
        <label htmlFor="nombre-zona">Nombre</label>
        <input id="nombre-zona" placeholder="Bogotá Norte" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
      </div>
      <div className="campo">
        <label htmlFor="desc-zona">Descripción</label>
        <input id="desc-zona" placeholder="Usaquén, Suba y Chapinero" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      </div>
      <MensajeError>{error}</MensajeError>
      <button className="btn" type="submit">{zona ? 'Guardar' : 'Crear zona'}</button>
    </form>
  );
}
