# Electrolineras

Plataforma de gestión y facturación de cargadores eléctricos DC. Permite a un operador
(dueño de uno o varios cargadores) registrar su hardware, definir tarifas, y facturar
automáticamente a los usuarios finales, con reparto de comisión hacia la plataforma.

## Estructura del repositorio

```
electrolineras/
├── backend/     # API NestJS: operadores, cargadores, sesiones, facturación, gateway OCPP
├── frontend/    # Next.js 14: panel de operador + app de usuario final (QR → carga → pago)
├── simulador/   # Simulador OCPP del cargador para pruebas (npm install && npm start -- <url> <serie>)
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

1. ~~Confirmar versión OCPP del MDXDC3001~~ → **OCPP 1.6J** (ws/wss), según el manual del equipo.
2. Conectar PostgreSQL real (TypeORM) — las entidades ya están definidas; hoy los datos se guardan en archivos JSON (`backend/data`).
3. ~~Gateway OCPP 1.6J~~ → implementado (`ws://<servidor>:3000/ocpp/<serie>`) con consola de comandos y simulador; falta probarlo con el MDXDC3001 real.
4. Integrar la API de cobro y dispersión de pagos de Wompi (hoy el pago queda `pendiente`).
5. ~~App de usuario~~ → versión web lista: QR → iniciar carga → carga en vivo → pagar → recibo.
6. ~~Panel~~ → barra lateral, login con roles (administrador / operador), dashboard con gráficos, QR descargable, consola OCPP y configuración.
7. ~~Proformas~~ → prefacturas con consecutivo, QR de verificación, listado, anulación y parametrización en Configuración.

## Producción con PM2

```bash
cd backend && npm install && npm run build && cd ..
cd frontend && npm install && npm run build && cd ..
pm2 start ecosystem.config.js
pm2 save
```

Despliegue recomendado: contenedor LXC Ubuntu 24.04 en Proxmox, con un solo comando en el host:

```bash
IP=192.168.2.50/24 GW=192.168.2.1 \
  bash <(curl -fsSL https://raw.githubusercontent.com/infraestructura-it/electrolineras/main/scripts/proxmox/crear-lxc.sh)
```

En Windows Server usar los scripts de `scripts/windows/`. Detalle de ambos en `CLAUDE.md`.

## Créditos

Desarrollado por **[Infraestructura-IT](https://infraestructura-it.com)** (Bogotá, Colombia).

- **Jairo Sepúlveda**: dirección del proyecto, arquitectura, integración con el cargador
  MDXDC3001 y pruebas en campo.
- **Claude** (Anthropic): coautor del código, como asistente de desarrollo con IA. Los commits en
  los que participó llevan la línea `Co-Authored-By: Claude`, por eso aparece en la lista de
  contribuidores de GitHub.

Las decisiones de diseño, las pruebas con el equipo real y la responsabilidad sobre el software
son de Infraestructura-IT.
