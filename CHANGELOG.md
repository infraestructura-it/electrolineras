# Historial de versiones

## v1.0.0 — 2026-10-17

Primera versión completa de la plataforma, validada con el simulador del MDXDC3001.

### Operación y OCPP
- Gateway OCPP 1.6J y 2.0.1 (seleccionable por cargador o negociado automáticamente).
- Cargas desde la app (QR), tarjeta RFID o consola OCPP; recuperación de transacciones huérfanas.
- Consola OCPP con catálogo por versión; monitor en vivo en pantalla completa.

### Organización y acceso
- Zonas, empresas, electrolineras con ubicación en mapa, cargadores.
- Roles admin, administrador de empresa y operario (por zona).
- Ingreso con huella / rostro (WebAuthn, requiere HTTPS).
- Licencias de activación por empresa firmadas por IIT (Ed25519).

### Conductor y facturación
- App del conductor: mapa, cuenta, historial; programa de puntos con redención como descuento.
- Comisión por empresa, dashboard, proformas con consecutivo, QR y retenciones.

### Pruebas y despliegue
- Simulador (1.6J / 2.0.1, batería, cortes de red, modo automático) y flota de prueba
  (`scripts/windows/simular-cargadores.ps1`).
- Despliegue en Windows Server con PM2 y en contenedor LXC Ubuntu (Proxmox).

### Limitaciones conocidas
- Sin cobro real: el pago queda `pendiente` hasta integrar la pasarela.
- Persistencia en archivos JSON (pendiente PostgreSQL).
- Sin HTTPS: la huella no funciona por IP.
- La proforma no es factura electrónica DIAN.
- Gateway sin probar aún con el MDXDC3001 real.
