# Simulador OCPP (1.6J y 2.0.1)

Simula un cargador MDXDC3001 para probar la plataforma sin el equipo. Habla OCPP 1.6J por defecto
o 2.0.1 con `--ocpp 2.0.1`, y simula la batería del vehículo (se detiene solo al 100 %). En 1.6J envía `BootNotification`,
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

También funciona desde la raíz del repo (`C:\pruebas\electrolineras`): `npm start -- <url> <serie>` instala
lo necesario y corre el simulador.

En Linux es igual (`mkdir ~/pruebas && cd ~/pruebas`, etc.).

- La URL es la misma que va en `domain_master` del cargador; el simulador le agrega el número de
  serie, como hace el equipo.
- El número de serie debe estar registrado en el panel (**Cargadores**); si no, el servidor
  rechaza la conexión (404).
- Correrlo desde **otro equipo de la red** (no en el servidor) prueba también el firewall y la
  red, igual que el cargador real.
- Opciones:
  - `--ocpp 1.6` (por defecto) o `--ocpp 2.0.1`: versión del protocolo (subprotocolo WebSocket
    `ocpp1.6` / `ocpp2.0.1`). En 2.0.1 usa `TransactionEvent` en vez de Start/StopTransaction.
    Si el cargador está registrado con una versión fija distinta, el servidor rechaza la conexión.
  - `--potencia 30` (kW) e `--intervalo 5` (segundos entre `MeterValues`).
  - `--bateria 60` (kWh del vehículo) y `--soc 20` (% con el que llega): la app muestra el % de
    batería y la carga termina sola al llegar al 100 %.

Para traer cambios más adelante: `git pull` dentro de `C:\pruebas\electrolineras` y `npm install`.

## Teclas mientras corre

| Tecla | Acción |
|---|---|
| `t <tarjeta>` | Pasar una tarjeta RFID (debe estar autorizada en Configuración → RFID). Ej.: `t AF22FF0B` |
| `s` | Detener la carga desde el cargador (`StopTransaction`) |
| `f` | Simular una falla (`StatusNotification` Faulted) |
| `a` | Volver a disponible (`Available`) |
| `c [seg]` | Cortar la red N segundos (por defecto 30). La carga sigue; si se detiene sin red, el `StopTransaction` se guarda y se envía al reconectar |
| `x` | Reinicio que **pierde** la transacción (como un firmware defectuoso): el servidor la cierra solo con la última lectura |
| `q` | Salir |

## Pruebas sugeridas

| Prueba | Qué hacer | Qué ver en el panel |
|---|---|---|
| Conexión | Arrancar el simulador | Consola OCPP: `BootNotification` y `Heartbeat`; el cargador conectado |
| Carga RFID | `t AF22FF0B`, esperar, `s` | Sesiones: `en_curso` con kWh subiendo → `finalizada` |
| Carga por QR | Abrir `http://<servidor>:3001/c/<serie>` → Iniciar → Detener → Pagar | La app en vivo, sesión pagada (pendiente) y proforma emitida |
| Falla | `f` y luego `a` | Cargador `en_falla` y de vuelta a activo |
| Corte de red | `t AF22FF0B`, `c 20`, esperar a que reconecte, `s` | La sesión sigue `en_curso` tras el corte y cierra con todos los kWh |
| Transacción perdida | `t AF22FF0B`, luego `x` | Detener en la app cierra la sesión al instante; sin tocar nada, se cierra sola en ~2 min |
| OCPP 2.0.1 | `npm start -- <url> <serie> --ocpp 2.0.1`, luego `t AF22FF0B` | Consola OCPP: `TransactionEvent`; el catálogo de comandos cambia a 2.0.1 |
| Batería llena | `--soc 95` y `t AF22FF0B` | La carga se detiene sola (motivo `EVDisconnected`) |
| Comandos | Consola OCPP → `GetConfiguration`, `TriggerMessage`, `Reset` | La respuesta del simulador en el registro de mensajes |
