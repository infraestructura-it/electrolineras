export default function Home() {
  return (
    <>
      <h1>Electrolineras</h1>
      <p>Panel de gestión de operadores, cargadores, sesiones de carga y facturación.</p>

      <div className="card">
        <div className="card-title">Operadores</div>
        <div className="card-meta">
          Dueños de cargadores (conjuntos residenciales, centros comerciales, oficinas).
          Cada uno define su tarifa y su comisión pactada con la plataforma.
        </div>
      </div>

      <div className="card">
        <div className="card-title">Cargadores</div>
        <div className="card-meta">
          Hardware físico (ej. MDXDC3001) registrado por número de serie y vinculado a un
          operador. Habla OCPP con el gateway del backend.
        </div>
      </div>

      <div className="card">
        <div className="card-title">Sesiones de carga</div>
        <div className="card-meta">
          Cada vez que un usuario carga su vehículo, desde que inicia hasta que termina y
          reporta su consumo en kWh.
        </div>
      </div>

      <div className="card">
        <div className="card-title">Facturación</div>
        <div className="card-meta">
          Calcula el costo de una sesión y reparte el pago entre la comisión de la
          plataforma y el operador (integración con Wompi pendiente).
        </div>
      </div>
    </>
  );
}
