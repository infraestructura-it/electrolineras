# Electrolineras

Plataforma de gestión y facturación de cargadores eléctricos DC. Permite a un operador
(dueño de uno o varios cargadores) registrar su hardware, definir tarifas, y facturar
automáticamente a los usuarios finales, con reparto de comisión hacia la plataforma.

## Estructura del repositorio

```
electrolineras/
├── backend/     # API NestJS: operadores, cargadores, sesiones, facturación, gateway OCPP
├── frontend/    # Panel de operador en Next.js 14 (operadores, cargadores, sesiones, facturación)
├── docs/        # Especificación técnica y modelo de datos
└── scripts/windows/  # Scripts de despliegue para Windows Server (PM2, firewall, arranque)
```

Guía de trabajo, convenciones y despliegue en Windows Server: ver [`CLAUDE.md`](CLAUDE.md).

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
4. Completar el frontend (panel de operador listo en versión inicial; falta app de usuario).

## Producción con PM2

```bash
cd backend && npm install && npm run build && cd ..
cd frontend && npm install && npm run build && cd ..
pm2 start ecosystem.config.js
pm2 save
```

En Windows Server usar los scripts de `scripts/windows/` (detalle en `CLAUDE.md`).
