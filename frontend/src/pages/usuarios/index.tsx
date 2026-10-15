import { useState } from 'react';
import { KeyRound, Pencil, Plus } from 'lucide-react';
import { Encabezado, MensajeError, Modal, useDatos } from '@/components/ui';
import { formatoFecha, NOMBRE_ROL, operadoresApi, Rol, Usuario, usuariosApi, Zona, zonasApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function UsuariosPage() {
  const { usuario: yo, esAdmin } = useAuth();
  const usuarios = useDatos(() => usuariosApi.listar());
  const operadores = useDatos(() => operadoresApi.listar());
  const zonas = useDatos(() => zonasApi.listar());
  const [dialogo, setDialogo] = useState<
    { tipo: 'nuevo' } | { tipo: 'clave'; usuario: Usuario } | { tipo: 'editar'; usuario: Usuario } | null
  >(null);
  const nombreZona = (id: string | null) => zonas.datos?.find((z) => z.id === id)?.nombre ?? null;
  const [error, setError] = useState<string | null>(null);

  const nombreOperador = (id: string | null) => operadores.datos?.find((o) => o.id === id)?.nombre ?? '—';

  async function alternar(u: Usuario) {
    try {
      await usuariosApi.cambiarActivo(u.id, !u.activo);
      usuarios.recargar();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <Encabezado
        titulo="Usuarios"
        descripcion={
          esAdmin
            ? 'Administradores de la plataforma y usuarios de cada empresa. El operario opera sin configurar; con zona, solo ve esa zona.'
            : 'Usuarios de tu empresa. El operario opera (monitor, sesiones) sin configurar; con zona, solo ve esa zona.'
        }
      >
        <button className="btn" onClick={() => setDialogo({ tipo: 'nuevo' })}>
          <Plus size={18} /> Nuevo usuario
        </button>
      </Encabezado>

      <MensajeError>{error ?? usuarios.error}</MensajeError>

      <section className="superficie">
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Correo</th>
                <th>Rol</th>
                <th>Empresa / zona</th>
                <th>Creado</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(usuarios.datos ?? []).map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>
                    {u.nombre}
                    {u.id === yo?.id && <span className="secundario"> (tú)</span>}
                  </td>
                  <td>{u.email}</td>
                  <td>
                    <span className={`estado ${u.rol === 'admin' ? 'carga' : u.rol === 'administrador' ? 'ok' : ''}`}>{NOMBRE_ROL[u.rol] ?? u.rol}</span>
                  </td>
                  <td>
                    {u.rol === 'admin' ? '—' : nombreOperador(u.operador_id)}
                    {u.rol === 'operario' && <div className="secundario">{nombreZona(u.zona_id) ?? 'Todas las zonas'}</div>}
                  </td>
                  <td className="secundario">{u.creado ? formatoFecha(u.creado) : '—'}</td>
                  <td>
                    <span className={`estado ${u.activo ? 'ok' : ''}`}>{u.activo ? 'Activo' : 'Desactivado'}</span>
                  </td>
                  <td>
                    <div className="acciones" style={{ flexWrap: 'nowrap' }}>
                      {u.id !== yo?.id && u.rol !== 'admin' && (
                        <button className="btn chico sec" onClick={() => setDialogo({ tipo: 'editar', usuario: u })}>
                          <Pencil size={14} /> Rol
                        </button>
                      )}
                      <button className="btn chico sec" onClick={() => setDialogo({ tipo: 'clave', usuario: u })}>
                        <KeyRound size={14} /> Clave
                      </button>
                      {u.id !== yo?.id && (
                        <button className={`btn chico ${u.activo ? 'peligro' : 'sec'}`} onClick={() => alternar(u)}>
                          {u.activo ? 'Desactivar' : 'Activar'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {dialogo?.tipo === 'nuevo' && (
        <Modal titulo="Nuevo usuario" alCerrar={() => setDialogo(null)}>
          <FormularioUsuario
            operadores={esAdmin ? operadores.datos ?? [] : null}
            zonas={zonas.datos ?? []}
            alGuardar={() => {
              setDialogo(null);
              usuarios.recargar();
            }}
          />
        </Modal>
      )}
      {dialogo?.tipo === 'editar' && (
        <Modal titulo={`Rol de ${dialogo.usuario.nombre}`} alCerrar={() => setDialogo(null)}>
          <FormularioRol
            usuario={dialogo.usuario}
            zonas={zonas.datos ?? []}
            alGuardar={() => {
              setDialogo(null);
              usuarios.recargar();
            }}
          />
        </Modal>
      )}
      {dialogo?.tipo === 'clave' && (
        <Modal titulo={`Cambiar clave de ${dialogo.usuario.nombre}`} alCerrar={() => setDialogo(null)}>
          <FormularioClave usuario={dialogo.usuario} alGuardar={() => setDialogo(null)} />
        </Modal>
      )}
    </>
  );
}

function FormularioUsuario({
  operadores,
  zonas,
  alGuardar,
}: {
  operadores: { id: string; nombre: string }[] | null; // null: lo crea un administrador de empresa
  zonas: Zona[];
  alGuardar: () => void;
}) {
  const [form, setForm] = useState({ nombre: '', email: '', password: '', rol: 'operario' as Rol, operador_id: '', zona_id: '' });
  const [error, setError] = useState<string | null>(null);
  const cambiar = (campo: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [campo]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await usuariosApi.crear({
        ...form,
        operador_id: form.rol !== 'admin' && operadores ? form.operador_id : undefined,
        zona_id: form.rol === 'operario' ? form.zona_id || null : null,
      });
      alGuardar();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <form className="formulario dos" onSubmit={onSubmit}>
      <div className="campo">
        <label htmlFor="nombre">Nombre</label>
        <input id="nombre" value={form.nombre} onChange={cambiar('nombre')} required />
      </div>
      <div className="campo">
        <label htmlFor="email">Correo</label>
        <input id="email" type="email" value={form.email} onChange={cambiar('email')} required />
      </div>
      <div className="campo">
        <label htmlFor="rol">Rol</label>
        <select id="rol" value={form.rol} onChange={cambiar('rol')}>
          <option value="operario">Operario</option>
          <option value="administrador">Administrador de empresa</option>
          {operadores && <option value="admin">Administrador de plataforma</option>}
        </select>
      </div>
      {form.rol === 'operario' && (
        <div className="campo">
          <label htmlFor="zona">Zona</label>
          <select id="zona" value={form.zona_id} onChange={cambiar('zona_id')}>
            <option value="">Todas las zonas</option>
            {zonas.map((z) => (
              <option key={z.id} value={z.id}>
                {z.nombre}
              </option>
            ))}
          </select>
        </div>
      )}
      {form.rol !== 'admin' && operadores && (
        <div className="campo">
          <label htmlFor="operador">Empresa</label>
          <select id="operador" value={form.operador_id} onChange={cambiar('operador_id')} required>
            <option value="">Selecciona</option>
            {operadores.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nombre}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="campo ancho-completo">
        <label htmlFor="password">Clave inicial</label>
        <input id="password" type="text" minLength={8} value={form.password} onChange={cambiar('password')} required />
        <span className="ayuda">Mínimo 8 caracteres. Compártela por un canal seguro y pide que la cambie.</span>
      </div>
      <div className="ancho-completo">
        <MensajeError>{error}</MensajeError>
      </div>
      <div className="ancho-completo acciones">
        <button className="btn" type="submit">Crear usuario</button>
      </div>
    </form>
  );
}

function FormularioRol({ usuario, zonas, alGuardar }: { usuario: Usuario; zonas: Zona[]; alGuardar: () => void }) {
  const [rol, setRol] = useState<Rol>(usuario.rol);
  const [zona, setZona] = useState(usuario.zona_id ?? '');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await usuariosApi.actualizar(usuario.id, { rol, zona_id: rol === 'operario' ? zona || null : null });
      alGuardar();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <form className="formulario" onSubmit={onSubmit}>
      <div className="campo">
        <label htmlFor="rol-e">Rol</label>
        <select id="rol-e" value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
          <option value="operario">Operario</option>
          <option value="administrador">Administrador de empresa</option>
        </select>
      </div>
      {rol === 'operario' && (
        <div className="campo">
          <label htmlFor="zona-e">Zona</label>
          <select id="zona-e" value={zona} onChange={(e) => setZona(e.target.value)}>
            <option value="">Todas las zonas</option>
            {zonas.map((z) => (
              <option key={z.id} value={z.id}>
                {z.nombre}
              </option>
            ))}
          </select>
        </div>
      )}
      <MensajeError>{error}</MensajeError>
      <button className="btn" type="submit">Guardar</button>
    </form>
  );
}

function FormularioClave({ usuario, alGuardar }: { usuario: Usuario; alGuardar: () => void }) {
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await usuariosApi.cambiarClave(usuario.id, clave);
      alGuardar();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <form className="formulario" onSubmit={onSubmit}>
      <div className="campo">
        <label htmlFor="clave">Nueva clave</label>
        <input id="clave" type="password" autoComplete="new-password" minLength={8} value={clave} onChange={(e) => setClave(e.target.value)} required />
      </div>
      <MensajeError>{error}</MensajeError>
      <button className="btn" type="submit">Cambiar clave</button>
    </form>
  );
}
