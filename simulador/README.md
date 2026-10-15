# Simulador OCPP 1.6J

Simula un cargador MDXDC3001 para probar la plataforma sin el equipo. Envía `BootNotification`,
`Heartbeat`, `StatusNotification`, `Authorize`, `StartTransaction`, `MeterValues` y
`StopTransaction`, y responde a los comandos de la consola OCPP (RemoteStart/Stop, Reset,
GetConfiguration, TriggerMessage…). Solo necesita Node.js 18 o superior.

## Clonar, instalar y correr (Windows, PowerShell)

```powershell
mkdir C:\pruebas; cd C:\pruebas
git clone https://github.com/infraestructura-it/electrolineras.git
cd electrolineras\simulador
npm install
npm start -- ws://192.168.2.47:3000/ocpp/ws 2222233333
```

En Linux es igual (`mkdir ~/pruebas && cd ~/pruebas`, etc.).

- La URL es la misma que va en `domain_master` del cargador; el simulador le agrega el número de
  serie, como hace el equipo.
- El número de serie debe estar registrado en el panel (**Cargadores**); si no, el servidor
  rechaza la conexión (404).
- Correrlo desde **otro equipo de la red** (no en el servidor) prueba también el firewall y la
  red, igual que el cargador real.
- Opciones: `--potencia 30` (kW) y `--intervalo 5` (segundos entre `MeterValues`).

Para traer cambios más adelante: `git pull` dentro de `C:\pruebas\electrolineras` y `npm install`.

## Teclas mientras corre

| Tecla | Acción |
|---|---|
| `t <tarjeta>` | Pasar una tarjeta RFID (debe estar autorizada en Configuración → RFID). Ej.: `t AF22FF0B` |
| `s` | Detener la carga desde el cargador (`StopTransaction`) |
| `f` | Simular una falla (`StatusNotification` Faulted) |
| `a` | Volver a disponible (`Available`) |
| `q` | Salir |

## Pruebas sugeridas

| Prueba | Qué hacer | Qué ver en el panel |
|---|---|---|
| Conexión | Arrancar el simulador | Consola OCPP: `BootNotification` y `Heartbeat`; el cargador conectado |
| Carga RFID | `t AF22FF0B`, esperar, `s` | Sesiones: `en_curso` con kWh subiendo → `finalizada` |
| Carga por QR | Abrir `http://<servidor>:3001/c/<serie>` → Iniciar → Detener → Pagar | La app en vivo, sesión pagada (pendiente) y proforma emitida |
| Falla | `f` y luego `a` | Cargador `en_falla` y de vuelta a activo |
| Comandos | Consola OCPP → `GetConfiguration`, `TriggerMessage`, `Reset` | La respuesta del simulador en el registro de mensajes |
