# Electrolineras · v1.0

Plataforma de gestión y facturación de cargadores eléctricos DC. Una empresa (operador) registra
sus electrolineras y cargadores, define tarifas y factura a los conductores; la plataforma retiene
una comisión pactada con cada empresa. Hardware de referencia: cargador DC 30 kW **MDXDC3001**
(OCPP 1.6J, CCS2, RFID y QR).

Guía técnica, convenciones y despliegue: [`CLAUDE.md`](CLAUDE.md). Historial de versiones:
[`CHANGELOG.md`](CHANGELOG.md).

## Estructura del repositorio

```
electrolineras/
├── backend/        # API NestJS + gateway OCPP 1.6J / 2.0.1 (puerto 3000)
├── frontend/       # Next.js 14: panel, monitor, app del conductor (puerto 3001)
├── simulador/      # Simulador OCPP del MDXDC3001 (uno o una flota)
├── herramientas/   # licencias-iit.js: emisión de licencias (solo IIT)
├── docs/           # Especificación técnica y modelo de datos
└── scripts/        # Despliegue: proxmox/ (LXC), linux/, windows/ (+ simular-cargadores.ps1)
```

## Qué incluye la versión 1.0

**Operación y OCPP**
- Gateway OCPP **1.6J y 2.0.1**, seleccionable por cargador (o automático).
- Inicio y fin de carga desde la app (QR), con tarjeta RFID o desde la consola OCPP.
- Recuperación de transacciones huérfanas (cortes de red, reinicios del cargador).
- Consola OCPP con catálogo de comandos por versión y registro de mensajes.
- Monitor en vivo en pantalla completa (otra pestaña).

**Organización y acceso**
- Jerarquía Zona → Empresa → Electrolinera → Cargador, con ubicación en mapa.
- Roles: admin de la plataforma, administrador de empresa y operario (opcionalmente por zona).
- Ingreso con clave o con huella / rostro del dispositivo (passkeys; requiere HTTPS).
- Licencias de activación por empresa (NIT, límite de cargadores, vencimiento), firmadas por IIT.

**Conductor y facturación**
- App del conductor: mapa de electrolineras con disponibilidad, cuenta, historial de cargas.
- Programa de puntos por empresa: acumulación por kWh y redención como descuento.
- Tarifa por kWh, cálculo de comisión por empresa, dashboard de energía e ingresos.
- Proformas (prefacturas) con consecutivo, QR de verificación, retenciones y anulación.

**Pruebas y despliegue**
- Simulador del MDXDC3001 (1.6J / 2.0.1, batería, cortes de red) y flota de 10 cargadores.
- Despliegue en Windows Server (PM2) o contenedor LXC Ubuntu en Proxmox con un comando.

## Lo que falta (hoja de ruta)

Ordenado por prioridad para salir a operación comercial.

| # | Pendiente | Por qué importa | Estado |
|---|---|---|---|
| 1 | **Probar con el MDXDC3001 real** | Todo el flujo OCPP está validado solo con el simulador | Pendiente: falta la conexión de red del equipo |
| 2 | **Pasarela de pagos** (cobro real + dispersión a cada empresa) | Hoy el pago queda `pendiente`: no entra dinero | Pendiente: elegir pasarela (ver propuesta abajo) |
| 3 | **Dominio con HTTPS y `wss://`** | Seguridad de pagos y datos; la huella lo exige; los cargadores conectan cifrado | Pendiente: certificado para `cargador.infraestructura-it.com` |
| 4 | **Base de datos PostgreSQL** | Hoy son archivos JSON: sirve para pruebas, no para muchas empresas | Pendiente: las entidades TypeORM ya existen |
| 5 | **Respaldos automáticos** | Proteger sesiones, pagos y proformas | Pendiente |
| 6 | **Factura electrónica DIAN** (proveedor tecnológico) | Obligatoria para facturar; la proforma no la reemplaza | Pendiente |
| 7 | **Activar licenciamiento** | Generar las llaves de IIT y publicar la llave pública | Herramienta lista, falta generar llaves |
| 8 | **Envío de recibo / proforma por correo** | Hoy el conductor solo lo ve en la app | Pendiente |
| 9 | **Notificaciones de falla** (correo / WhatsApp al operador) | Enterarse sin mirar el monitor | Pendiente |
| 10 | **Reservas y tarifas por horario** | Precio distinto en hora pico; apartar cargador | Pendiente |
| 11 | **App móvil instalable (PWA)** | Icono en el celular, notificaciones de fin de carga | Pendiente |
| 12 | **Pruebas automáticas (CI)** | Evitar que un cambio rompa lo que ya funciona | Pendiente |
| 13 | **Probar OCPP 2.0.1 con un equipo real** | Solo validado con el simulador | Pendiente |

## Cómo correr en desarrollo

```bash
cd backend && npm install && npm run start:dev     # API en :3000
cd frontend && npm install && npm run dev -- -p 3001  # panel en :3001
npm start -- ws://localhost:3000/ocpp/ws <serie>   # simulador, desde la raíz
```

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
