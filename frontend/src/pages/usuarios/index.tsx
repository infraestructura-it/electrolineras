import { useState } from 'react';
import { KeyRound, Plus } from 'lucide-react';
import { Encabezado, MensajeError, Modal, useDatos } from '@/components/ui';
import { formatoFecha, operadoresApi, Rol, Usuario, usuariosApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function UsuariosPage() {
  const { usuario: yo } = useAuth();
  const usuarios = useDatos(() => usuariosApi.listar());
  const operadores = useDatos(() => operadoresApi.listar());
  const [dialogo, setDialogo] = useState<{ tipo: 'nuevo' } | { tipo: 'clave'; usuario: Usuario } | null>(null);
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
        descripcion="Administradores de la plataforma y usuarios de cada operador. Un operador solo ve sus cargadores."
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
                <th>Operador</th>
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
                    <span className={`estado ${u.rol === 'admin' ? 'carga' : ''}`}>{u.rol === 'admin' ? 'Administrador' : 'Operador'}</span>
                  </td>
                  <td>{u.rol === 'operador' ? nombreOperador(u.operador_id) : '—'}</td>
                  <td className="secundario">{u.creado ? formatoFecha(u.creado) : '—'}</td>
                  <td>
                    <span className={`estado ${u.activo ? 'ok' : ''}`}>{u.activo ? 'Activo' : 'Desactivado'}</span>
                  </td>
                  <td>
                    <div className="acciones" style={{ flexWrap: 'nowrap' }}>
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
            operadores={operadores.datos ?? []}
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

function FormularioUsuario({ operadores, alGuardar }: { operadores: { id: string; nombre: string }[]; alGuardar: () => void }) {
  const [form, setForm] = useState({ nombre: '', email: '', password: '', rol: 'operador' as Rol, operador_id: '' });
  const [error, setError] = useState<string | null>(null);
  const cambiar = (campo: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [campo]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await usuariosApi.crear({ ...form, operador_id: form.rol === 'operador' ? form.operador_id : undefined });
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
          <option value="operador">Operador</option>
          <option value="admin">Administrador</option>
        </select>
      </div>
      {form.rol === 'operador' && (
        <div className="campo">
          <label htmlFor="operador">Operador</label>
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
