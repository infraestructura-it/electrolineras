import { useState } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import { Fingerprint, KeyRound, Trash2 } from 'lucide-react';
import { Encabezado, MensajeError, useDatos } from '@/components/ui';
import { formatoFecha, haceCuanto, huellaApi, NOMBRE_ROL, usuariosApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';

// Datos del usuario, cambio de clave y huellas registradas (passkeys).
export default function CuentaPage() {
  const { usuario } = useAuth();
  const huellas = useDatos(() => huellaApi.listar());
  const [nombre, setNombre] = useState('');
  const [registrando, setRegistrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const disponible = typeof window !== 'undefined' && window.isSecureContext && 'PublicKeyCredential' in window;

  if (!usuario) return null;

  async function registrar() {
    setError(null);
    setOk(null);
    setRegistrando(true);
    try {
      const opciones = await huellaApi.opcionesRegistro();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const respuesta = await startRegistration({ optionsJSON: opciones as any });
      await huellaApi.registrar(respuesta, nombre || 'Este dispositivo');
      setNombre('');
      setOk('Huella registrada. La próxima vez puedes entrar con “Entrar con huella”.');
      huellas.recargar();
    } catch (e) {
      const err = e as Error;
      setError(
        err.name === 'InvalidStateError'
          ? 'Este dispositivo ya tiene una huella registrada para tu usuario.'
          : err.name === 'NotAllowedError'
            ? 'Se canceló el registro de la huella.'
            : err.message,
      );
    } finally {
      setRegistrando(false);
    }
  }

  async function eliminar(id: string) {
    if (!window.confirm('¿Quitar esta huella? Ese dispositivo ya no podrá entrar con huella.')) return;
    try {
      await huellaApi.eliminar(id);
      huellas.recargar();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <Encabezado titulo="Mi cuenta" descripcion={`${usuario.nombre} · ${usuario.email} · ${NOMBRE_ROL[usuario.rol]}`} />

      <div className="rejilla" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <section className="superficie">
          <div className="superficie-titulo">
            <h2 className="titulo-icono">
              <Fingerprint size={18} aria-hidden="true" /> Entrar con huella
            </h2>
          </div>
          <p className="secundario">
            Usa el lector de huella o el rostro de tu celular o PC (passkey). La huella nunca sale de tu dispositivo: la plataforma
            solo guarda una llave pública.
          </p>
          {disponible ? (
            <div className="formulario" style={{ marginTop: 12 }}>
              <div className="campo">
                <label htmlFor="disp">Nombre del dispositivo</label>
                <input id="disp" placeholder="Celular de turno, PC recepción…" value={nombre} onChange={(e) => setNombre(e.target.value)} />
              </div>
              <button className="btn" type="button" onClick={registrar} disabled={registrando}>
                <Fingerprint size={17} /> {registrando ? 'Esperando la huella…' : 'Registrar huella de este dispositivo'}
              </button>
            </div>
          ) : (
            <div className="aviso-linea">
              El navegador solo permite huella cuando el panel se abre por HTTPS (con dominio y certificado). Por ahora entra con tu clave.
            </div>
          )}
          <MensajeError>{error ?? huellas.error}</MensajeError>
          {ok && <div className="mensaje-ok">{ok}</div>}

          {(huellas.datos ?? []).length > 0 && (
            <table className="tabla" style={{ marginTop: 14 }}>
              <thead>
                <tr>
                  <th>Dispositivo</th>
                  <th>Registrada</th>
                  <th>Último uso</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(huellas.datos ?? []).map((h) => (
                  <tr key={h.id}>
                    <td style={{ fontWeight: 600 }}>{h.nombre}</td>
                    <td className="secundario">{formatoFecha(h.creado)}</td>
                    <td className="secundario">{h.ultimo_uso ? haceCuanto(h.ultimo_uso) : 'Nunca'}</td>
                    <td>
                      <button className="btn-icono" onClick={() => eliminar(h.id)} aria-label={`Quitar ${h.nombre}`} title="Quitar">
                        <Trash2 size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="superficie">
          <div className="superficie-titulo">
            <h2 className="titulo-icono">
              <KeyRound size={18} aria-hidden="true" /> Cambiar mi clave
            </h2>
          </div>
          <CambiarClave id={usuario.id} />
        </section>
      </div>
    </>
  );
}

function CambiarClave({ id }: { id: string }) {
  const [clave, setClave] = useState('');
  const [repetir, setRepetir] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setOk(false);
    if (clave !== repetir) return setError('Las claves no coinciden');
    try {
      await usuariosApi.cambiarClave(id, clave);
      setError(null);
      setOk(true);
      setClave('');
      setRepetir('');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <form className="formulario" onSubmit={onSubmit}>
      <div className="campo">
        <label htmlFor="nueva">Nueva clave</label>
        <input id="nueva" type="password" autoComplete="new-password" minLength={8} value={clave} onChange={(e) => setClave(e.target.value)} required />
      </div>
      <div className="campo">
        <label htmlFor="repetir">Repetir clave</label>
        <input id="repetir" type="password" autoComplete="new-password" minLength={8} value={repetir} onChange={(e) => setRepetir(e.target.value)} required />
      </div>
      <MensajeError>{error}</MensajeError>
      {ok && <div className="mensaje-ok">Clave cambiada.</div>}
      <button className="btn" type="submit">Cambiar clave</button>
    </form>
  );
}
