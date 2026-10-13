import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { Encabezado, MensajeError } from '@/components/ui';
import { Configuracion, configuracionApi, ParametrosFacturacion, urlOcpp } from '@/lib/api';

export default function ConfiguracionPage() {
  const [config, setConfig] = useState<Configuracion | null>(null);
  // Consecutivo tal como llegó del servidor: solo se envía si el usuario lo cambia, para no
  // pisar los números que la app haya emitido mientras la página estaba abierta.
  const [consecutivoCargado, setConsecutivoCargado] = useState<number | null>(null);
  const [tarjetas, setTarjetas] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    configuracionApi
      .obtener()
      .then((c) => {
        setConfig(c);
        setConsecutivoCargado(c.facturacion.siguiente_consecutivo);
        setTarjetas(c.tarjetas_rfid_autorizadas.join('\n'));
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  if (!config) return <MensajeError>{error}</MensajeError>;

  const cambiar = <K extends keyof Configuracion>(campo: K, valor: Configuracion[K]) => {
    setGuardado(false);
    setConfig({ ...config, [campo]: valor });
  };

  const cambiarF = <K extends keyof ParametrosFacturacion>(campo: K, valor: ParametrosFacturacion[K]) => {
    setGuardado(false);
    setConfig({ ...config, facturacion: { ...config.facturacion, [campo]: valor } });
  };
  const texto = (campo: keyof ParametrosFacturacion) => ({
    id: `f-${campo}`,
    value: String(config.facturacion[campo] ?? ''),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => cambiarF(campo, e.target.value as never),
  });
  const numeroF = (campo: keyof ParametrosFacturacion) => ({
    id: `f-${campo}`,
    type: 'number',
    value: String(config.facturacion[campo] ?? 0),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => cambiarF(campo, Number(e.target.value) as never),
  });
  const f = config.facturacion;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      const { siguiente_consecutivo, ...facturacion } = config!.facturacion;
      const nueva = await configuracionApi.actualizar({
        ...config!,
        facturacion: siguiente_consecutivo === consecutivoCargado ? facturacion : { ...facturacion, siguiente_consecutivo },
        tarjetas_rfid_autorizadas: tarjetas.split(/[\s,;]+/).filter(Boolean),
      });
      setConfig(nueva);
      setConsecutivoCargado(nueva.facturacion.siguiente_consecutivo);
      setTarjetas(nueva.tarjetas_rfid_autorizadas.join('\n'));
      setGuardado(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar}>
      <Encabezado titulo="Configuración" descripcion="Reglas de la plataforma: cobro, conexión de cargadores y acceso.">
        <button className="btn" type="submit" disabled={guardando}>
          <Save size={17} /> {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </Encabezado>

      <div style={{ display: 'grid', gap: 12, marginBottom: 18 }}>
        <MensajeError>{error}</MensajeError>
        {guardado && <div className="mensaje-ok">Cambios guardados.</div>}
      </div>

      <div className="rejilla rejilla-2">
        <section className="superficie">
          <div className="superficie-titulo">
            <div>
              <h2>Cobro</h2>
              <p>Se aplica a operadores sin comisión pactada.</p>
            </div>
          </div>
          <div className="formulario">
            <div className="campo">
              <label htmlFor="comision">Comisión por defecto de la plataforma (%)</label>
              <input id="comision" type="number" min="0" max="100" step="0.01" value={config.comision_por_defecto} onChange={(e) => cambiar('comision_por_defecto', Number(e.target.value))} />
            </div>
            <div className="campo">
              <label htmlFor="url">URL pública de la app de usuario</label>
              <input id="url" type="url" placeholder="https://carga.infraestructura-it.com" value={config.url_publica_app} onChange={(e) => cambiar('url_publica_app', e.target.value)} />
              <span className="ayuda">Base de los códigos QR. Vacío: se usa la dirección con la que abres este panel.</span>
            </div>
          </div>
        </section>

        <section className="superficie">
          <div className="superficie-titulo">
            <div>
              <h2>Acceso</h2>
              <p>Quién puede crear cuentas.</p>
            </div>
          </div>
          <label className="interruptor">
            <input type="checkbox" checked={config.permitir_registro_operadores} onChange={(e) => cambiar('permitir_registro_operadores', e.target.checked)} />
            <span>
              <span className="texto">Permitir que los operadores se registren solos</span>
              <span className="ayuda">Si lo apagas, solo un administrador crea operadores y usuarios.</span>
            </span>
          </label>
        </section>

        <section className="superficie">
          <div className="superficie-titulo">
            <div>
              <h2>Cargadores (OCPP 1.6J)</h2>
              <p>
                Gateway: <code>{urlOcpp()}/&lt;numero_serie&gt;</code>
              </p>
            </div>
          </div>
          <div className="formulario">
            <div className="campo">
              <label htmlFor="heartbeat">Intervalo de heartbeat (segundos)</label>
              <input id="heartbeat" type="number" min="10" max="86400" value={config.intervalo_heartbeat_s} onChange={(e) => cambiar('intervalo_heartbeat_s', Number(e.target.value))} />
              <span className="ayuda">Se envía al cargador en la respuesta a BootNotification.</span>
            </div>
            <label className="interruptor">
              <input type="checkbox" checked={config.aceptar_cargadores_desconocidos} onChange={(e) => cambiar('aceptar_cargadores_desconocidos', e.target.checked)} />
              <span>
                <span className="texto">Aceptar cargadores no registrados</span>
                <span className="ayuda">Solo para pruebas. Apagado, se rechaza cualquier número de serie que no esté en Cargadores.</span>
              </span>
            </label>
          </div>
        </section>

        <section className="superficie">
          <div className="superficie-titulo">
            <div>
              <h2>Tarjetas RFID autorizadas</h2>
              <p>Pueden iniciar cargas pasando la tarjeta por el lector.</p>
            </div>
          </div>
          <div className="campo">
            <label htmlFor="tarjetas">Una tarjeta por línea</label>
            <textarea id="tarjetas" rows={5} placeholder={'AF22FF0B\nAF1DC86B'} value={tarjetas} onChange={(e) => { setGuardado(false); setTarjetas(e.target.value); }} />
            <span className="ayuda">Las dos tarjetas que vienen con el MDXDC3001 son AF22FF0B y AF1DC86B. Las cargas con tarjeta se cobran a la tarifa del cargador.</span>
          </div>
        </section>

        <section className="superficie">
          <div className="superficie-titulo">
            <div>
              <h2>Medición simulada</h2>
              <p>Para probar la app sin un cargador conectado.</p>
            </div>
          </div>
          <div className="formulario">
            <label className="interruptor">
              <input type="checkbox" checked={config.simular_medicion} onChange={(e) => cambiar('simular_medicion', e.target.checked)} />
              <span>
                <span className="texto">Simular la carga cuando el cargador no está conectado</span>
                <span className="ayuda">Apágala en producción: así nadie inicia una carga en un cargador sin conexión.</span>
              </span>
            </label>
            <div className="campo">
              <label htmlFor="potencia">Potencia simulada (kW)</label>
              <input id="potencia" type="number" min="1" max="400" value={config.potencia_simulada_kw} onChange={(e) => cambiar('potencia_simulada_kw', Number(e.target.value))} disabled={!config.simular_medicion} />
            </div>
          </div>
        </section>
      </div>

      <section className="superficie" style={{ marginTop: 18 }}>
        <div className="superficie-titulo">
          <div>
            <h2>Proformas (prefacturas)</h2>
            <p>Datos que se imprimen en cada proforma. Se copian al emitirla: cambiarlos no altera las ya emitidas.</p>
          </div>
        </div>

        <div className="formulario dos">
          <div className="campo">
            <label htmlFor="f-razon_social">Razón social del emisor</label>
            <input {...texto('razon_social')} required />
          </div>
          <div className="campo">
            <label htmlFor="f-nit">NIT</label>
            <input {...texto('nit')} placeholder="901234567-8" />
          </div>
          <div className="campo">
            <label htmlFor="f-direccion">Dirección</label>
            <input {...texto('direccion')} placeholder="CL 100 15 20" />
          </div>
          <div className="campo">
            <label htmlFor="f-ciudad">Ciudad</label>
            <input {...texto('ciudad')} />
          </div>
          <div className="campo">
            <label htmlFor="f-telefono">Teléfono</label>
            <input {...texto('telefono')} />
          </div>
          <div className="campo">
            <label htmlFor="f-correo">Correo de facturación</label>
            <input {...texto('correo')} type="email" />
          </div>
          <div className="campo ancho-completo">
            <label htmlFor="f-sitio_web">Sitio web</label>
            <input {...texto('sitio_web')} />
          </div>
          <div className="campo ancho-completo">
            <label htmlFor="f-texto_legal">Texto legal</label>
            <textarea {...texto('texto_legal')} rows={3} style={{ fontFamily: 'var(--fuente)', fontSize: 14 }} placeholder="Régimen, responsabilidades de IVA, actividad económica (CIIU), tarifa ICA, resolución…" />
            <span className="ayuda">Va en el recuadro junto a los datos del cliente, como en la factura de referencia.</span>
          </div>
        </div>

        <h3 style={{ margin: '24px 0 12px' }}>Numeración</h3>
        <div className="formulario dos">
          <div className="campo">
            <label htmlFor="f-prefijo">Prefijo</label>
            <input {...texto('prefijo')} className="mono" maxLength={6} />
          </div>
          <div className="campo">
            <label htmlFor="f-siguiente_consecutivo">Siguiente consecutivo</label>
            <input {...numeroF('siguiente_consecutivo')} min={1} step={1} />
            <span className="ayuda">
              La próxima será <code>{f.prefijo}-{String(f.siguiente_consecutivo).padStart(6, '0')}</code>. No puede ser menor que una ya emitida.
            </span>
          </div>
        </div>

        <h3 style={{ margin: '24px 0 12px' }}>Impuestos y retenciones</h3>
        <div className="formulario dos">
          <div className="campo">
            <label htmlFor="f-iva_porcentaje">IVA (%)</label>
            <input {...numeroF('iva_porcentaje')} min={0} max={100} step="0.01" />
            <span className="ayuda">La tarifa por kWh ya incluye el IVA: la proforma lo desagrega.</span>
          </div>
          <div className="campo">
            <label htmlFor="f-retefuente_porcentaje">RteFuente (%)</label>
            <input {...numeroF('retefuente_porcentaje')} min={0} max={100} step="0.01" />
          </div>
          <div className="campo">
            <label htmlFor="f-reteiva_porcentaje">ReteIVA (% del IVA)</label>
            <input {...numeroF('reteiva_porcentaje')} min={0} max={100} step="0.01" />
          </div>
          <div className="campo">
            <label htmlFor="f-reteica_por_mil">ReteICA (por mil)</label>
            <input {...numeroF('reteica_por_mil')} min={0} max={1000} step="0.01" />
            <span className="ayuda">Según la actividad económica y el municipio (por ejemplo 11,04 por mil). Las retenciones solo se aplican si la proforma se emite marcando que el cliente las practica.</span>
          </div>
        </div>

        <h3 style={{ margin: '24px 0 12px' }}>Detalle y condiciones</h3>
        <div className="formulario dos">
          <div className="campo">
            <label htmlFor="f-codigo_producto">Código del producto</label>
            <input {...texto('codigo_producto')} className="mono" />
          </div>
          <div className="campo">
            <label htmlFor="f-descripcion_producto">Descripción del producto</label>
            <input {...texto('descripcion_producto')} />
          </div>
          <div className="campo">
            <label htmlFor="f-forma_pago">Forma de pago</label>
            <input {...texto('forma_pago')} />
          </div>
          <div className="campo">
            <label htmlFor="f-dias_vencimiento">Días para el vencimiento</label>
            <input {...numeroF('dias_vencimiento')} min={0} max={365} step={1} />
            <span className="ayuda">0 = vence el mismo día (contado).</span>
          </div>
          <div className="campo ancho-completo">
            <label htmlFor="f-nota_pie">Nota al pie</label>
            <input {...texto('nota_pie')} />
          </div>
        </div>
      </section>
    </form>
  );
}
