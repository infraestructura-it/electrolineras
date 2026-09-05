# Electrolineras

Plataforma de gestión y facturación de cargadores eléctricos DC. Permite a un operador
(dueño de uno o varios cargadores) registrar su hardware, definir tarifas, y facturar
automáticamente a los usuarios finales, con reparto de comisión hacia la plataforma.

## Estructura del repositorio

```
electrolineras/
├── backend/     # API NestJS: operadores, cargadores, sesiones, facturación, gateway OCPP
├── frontend/    # Panel de operador y app de usuario final (por definir)
└── docs/        # Especificación técnica y modelo de datos
```

## Estado actual

Esqueleto inicial del backend con los cinco módulos núcleo (ver `docs/especificacion-tecnica.md`
para el detalle de arquitectura, modelo de datos y flujo de facturación):

- `operadores` — CRUD básico de operadores.
- `cargadores` — registro y consulta de cargadores por número de serie.
- `sesiones` — inicio/fin de sesiones de carga.
- `facturacion` — cálculo de costo y reparto de comisión (pendiente integrar Wompi).
- `ocpp-gateway` — puente OCPP con el hardware (pendiente confirmar versión OCPP del MDXDC3001).

## Cómo correr el backend (una vez tengas Node.js instalado)

```bash
cd backend
npm install
npm run start:dev
```

## Pendientes inmediatos

1. Confirmar versión OCPP del cargador MDXDC3001 con el fabricante.
2. Conectar PostgreSQL real (TypeORM) — las entidades ya están definidas.
3. Integrar la API de cobro y dispersión de pagos de Wompi.
4. Definir y construir el frontend (panel de operador primero, luego app de usuario).
