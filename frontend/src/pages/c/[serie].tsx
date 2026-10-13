import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { cargadoresApi, sesionesApi, Cargador, ErrorApi, formatoCOP } from '@/lib/api';
import { leerSesionGuardada, guardarSesion, leerContacto, guardarContacto } from '@/lib/almacenLocal';

// Pantalla que abre el QR del cargador: https://<app>/c/<numero_serie>
// (en el MDXDC3001: qr_code_type = 0 y la URL en Basic Settings → QR code).
export default function CargadorPublico() {
  const router = useRouter();
  const serie = typeof router.query.serie === 'string' ? router.query.serie : null;

  const [cargador, setCargador] = useState<Cargador | null>(null);
  const [noEncontrado, setNoEncontrado] = useState(false);
  const [contacto, setContacto] = useState('');
  const [sesionPrevia, setSesionPrevia] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [iniciando, setIniciando] = useState(false);

  useEffect(() => {
    if (!serie) return;
    setContacto(leerContacto());
    setSesionPrevia(leerSesionGuardada(serie));
    cargadoresApi
      .obtenerPorSerie(serie)
      .then(setCargador)
      .catch((e: Error) => {
        if (e instanceof ErrorApi && e.estado === 404) setNoEncontrado(true);
        else setError('No pudimos conectarnos con la plataforma. Revisa tu conexión e inténtalo de nuevo.');
      });
  }, [serie]);

  async function iniciar(e: React.FormEvent) {
    e.preventDefault();
    if (!cargador) return;
    setIniciando(true);
    setError(null);
    try {
      const sesion = await sesionesApi.iniciar({ numero_serie: cargador.numero_serie, usuario_id: contacto });
      guardarContacto(contacto);
      guardarSesion(cargador.numero_serie, sesion.id);
      router.push(`/carga/${sesion.id}`);
    } catch (e) {
      setError((e as Error).message);
      setIniciando(false);
    }
  }

  if (noEncontrado) {
    return (
      <div className="app-panel app-centro">
        <h1 className="app-titulo">Cargador no encontrado</h1>
        <p className="app-texto">
          El código <strong>{serie}</strong> no está registrado en la plataforma. Verifica el QR o
          pide ayuda al administrador del lugar.
        </p>
      </div>
    );
  }

  if (!cargador) {
    return error ? (
      <p className="app-error">{error}</p>
    ) : (
      <p className="app-texto app-centro">Cargando información del cargador…</p>
    );
  }

  const disponible = cargador.estado === 'activo' && cargador.tarifa_por_kwh != null;

  return (
    <>
      <section className="app-panel">
        <div className="app-etiqueta">Cargador {cargador.numero_serie}</div>
        <h1 className="app-titulo">{cargador.ubicacion || 'Estación de carga'}</h1>
        <p className="app-texto">{cargador.operador_nombre}</p>

        <dl className="app-datos">
          <div>
            <dt>Tarifa</dt>
            <dd>{cargador.tarifa_por_kwh != null ? `${formatoCOP(cargador.tarifa_por_kwh)} / kWh` : 'Sin definir'}</dd>
          </div>
          <div>
            <dt>Conector</dt>
            <dd>CCS2 · DC</dd>
          </div>
          <div>
            <dt>Estado</dt>
            <dd>
              <span className={`estado ${cargador.estado === 'activo' ? 'ok' : cargador.estado === 'en_falla' ? 'falla' : ''}`}>
                {cargador.estado === 'activo' ? 'Disponible' : cargador.estado === 'en_falla' ? 'En falla' : 'Inactivo'}
              </span>
            </dd>
          </div>
        </dl>
      </section>

      {sesionPrevia && (
        <Link className="app-aviso" href={`/carga/${sesionPrevia}`}>
          Tienes una carga reciente en este cargador. Ver estado →
        </Link>
      )}

      {disponible ? (
        <form className="app-panel app-form" onSubmit={iniciar}>
          <ol className="app-pasos">
            <li>Conecta la pistola CCS2 a tu vehículo.</li>
            <li>Escribe tu correo o celular para enviarte el recibo.</li>
            <li>Pulsa “Iniciar carga”.</li>
          </ol>

          <label htmlFor="contacto">Correo o celular</label>
          <input
            id="contacto"
            inputMode="email"
            autoComplete="email"
            placeholder="tu@correo.com o 300 123 4567"
            value={contacto}
            onChange={(e) => setContacto(e.target.value)}
            required
          />

          <button className="btn app-boton" type="submit" disabled={iniciando}>
            {iniciando ? 'Contactando el cargador…' : 'Iniciar carga'}
          </button>
          {error && <p className="app-error">{error}</p>}
        </form>
      ) : (
        <p className="app-panel app-texto">
          {cargador.tarifa_por_kwh == null
            ? 'Este cargador aún no tiene tarifa configurada. Intenta más tarde.'
            : 'Este cargador no está disponible en este momento.'}
        </p>
      )}
    </>
  );
}
