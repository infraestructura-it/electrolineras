import { useState } from 'react';
import { KeyRound, ShieldCheck, ShieldX, Trash2 } from 'lucide-react';
import { Encabezado, MensajeError, useDatos } from '@/components/ui';
import { EstadoLicencia, licenciasApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const TEXTO_LICENCIA: Record<EstadoLicencia, [string, string]> = {
  sin_control: ['Sin licenciamiento', ''],
  sin_licencia: ['Sin licencia', 'falla'],
  vigente: ['Vigente', 'ok'],
  por_vencer: ['Por vencer', 'alerta'],
  en_gracia: ['Vencida (en gracia)', 'alerta'],
  vencida: ['Vencida', 'falla'],
};

export default function LicenciasPage() {
  const { esAdmin } = useAuth();
  const resumen = useDatos(() => licenciasApi.resumen());
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const r = resumen.datos;

  async function activar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    setEnviando(true);
    try {
      await licenciasApi.activar(texto);
      setTexto('');
      setOk('Licencia activada.');
      resumen.recargar();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  async function quitar(id: string) {
    if (!window.confirm(`¿Quitar la licencia ${id}? La empresa quedará con la licencia anterior o sin licencia.`)) return;
    try {
      await licenciasApi.eliminar(id);
      resumen.recargar();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <Encabezado
        titulo="Licencias"
        descripcion="Cada empresa opera con una licencia de Infraestructura-IT que fija su número de cargadores y su vencimiento."
      />
      <MensajeError>{resumen.error}</MensajeError>

      {r && !r.configurado && (
        <div className="aviso-linea" style={{ marginBottom: 16 }}>
          <ShieldX size={16} aria-hidden="true" /> El licenciamiento no está activo en este servidor (falta la llave pública de IIT:
          <code>backend/licencia-publica.pem</code>). Todo funciona sin límites.
        </div>
      )}

      <div className="cargadores">
        {(r?.empresas ?? []).map((e) => {
          const [textoEstado, clase] = TEXTO_LICENCIA[e.estado];
          const porcentaje = e.max ? Math.min(100, Math.round((e.usados / e.max) * 100)) : 0;
          return (
            <article className="cargador" key={e.operador_id}>
              <div className="cargador-cabeza">
                <div style={{ minWidth: 0 }}>
                  <div className="sitio-nombre">{e.nombre}</div>
                  <div className="cargador-lugar mono">NIT {e.nit ?? 'sin definir'}</div>
                </div>
                <span className={`estado ${clase}`}>{textoEstado}</span>
              </div>
              {e.licencia ? (
                <>
                  <div className="cargador-datos">
                    <div>
                      <div className="dato-etiqueta">Licencia</div>
                      <div className="dato-valor mono">{e.licencia.id}</div>
                    </div>
                    <div>
                      <div className="dato-etiqueta">Vence</div>
                      <div className="dato-valor">
                        {new Date(`${e.licencia.vence}T12:00:00`).toLocaleDateString('es-CO', { dateStyle: 'medium' })}
                        {e.dias_restantes !== null && (
                          <div className="secundario">{e.dias_restantes >= 0 ? `${e.dias_restantes} días` : `hace ${-e.dias_restantes} días`}</div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="dato-etiqueta">
                      Cargadores: {e.usados} de {e.max}
                    </div>
                    <div className="barra-uso" role="progressbar" aria-valuenow={e.usados} aria-valuemin={0} aria-valuemax={e.max ?? 0}>
                      <span style={{ width: `${porcentaje}%` }} className={e.estado !== 'sin_control' && e.usados > (e.max ?? 0) ? 'excedida' : ''} />
                    </div>
                  </div>
                  {esAdmin && (
                    <div className="cargador-pie">
                      <button className="btn-icono" onClick={() => quitar(e.licencia!.id)} aria-label={`Quitar ${e.licencia.id}`} title="Quitar licencia">
                        <Trash2 size={17} />
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <p className="secundario">
                  {e.estado === 'sin_control' ? 'No se requiere licencia en este servidor.' : 'Sin licencia: no puede registrar cargadores ni iniciar cargas.'}
                </p>
              )}
            </article>
          );
        })}
      </div>

      {r?.configurado && (
        <section className="superficie" style={{ marginTop: 18, maxWidth: 760 }}>
          <h2 className="superficie-titulo">
            <KeyRound size={18} aria-hidden="true" /> Activar licencia
          </h2>
          <p className="secundario">
            Pega el texto que te envió Infraestructura-IT. Se asigna a la empresa con el mismo NIT; una licencia nueva reemplaza a la
            anterior. Vencida, hay {r.dias_gracia} días de gracia antes de bloquear las cargas.
          </p>
          <form className="formulario" onSubmit={activar}>
            <div className="campo">
              <label htmlFor="licencia">Licencia</label>
              <textarea id="licencia" className="mono" rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} required />
            </div>
            <MensajeError>{error}</MensajeError>
            {ok && (
              <div className="mensaje-ok">
                <ShieldCheck size={16} aria-hidden="true" /> {ok}
              </div>
            )}
            <button className="btn" type="submit" disabled={enviando}>
              {enviando ? 'Verificando…' : 'Activar licencia'}
            </button>
          </form>
        </section>
      )}
    </>
  );
}
