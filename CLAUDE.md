# CLAUDE.md — Electrolineras

Guía para Claude (y para cualquier persona) que trabaje en este repositorio.
Idioma del proyecto: **español** (código, comentarios, commits y documentación).

## Qué es

Plataforma de gestión y facturación de cargadores eléctricos DC. Un **operador** registra
sus cargadores, define tarifas y factura a los usuarios finales; la plataforma retiene una
comisión configurable por operador. Hardware de referencia: cargador DC 30 kW **MDXDC3001**,
**OCPP 1.6J** (`ws`/`wss`, confirmado en el manual), conector CCS2, RFID y QR. Detalle completo
y configuración del cargador en `docs/especificacion-tecnica.md` (secciones 8 y 9).

## Estructura

```
electrolineras/
├── backend/                 # API NestJS 10 (TypeScript) — puerto 3000 (API + gateway OCPP)
│   ├── src/comun/           # AlmacenService (persistencia JSON), decoradores @Publico/@Roles/@Usuario
│   ├── src/modules/         # auth, usuarios, configuracion, operadores, cargadores, sesiones,
│   │                        # facturacion, ocpp-gateway
│   ├── scripts/simulador-ocpp.js  # simulador del MDXDC3001 para probar sin el equipo
│   └── .env.example         # ADMIN_EMAIL, ADMIN_PASSWORD, JWT_SECRET, DATA_DIR, PORT
├── frontend/                # Next.js 14 (pages router) — puerto 3001 en producción
│   ├── src/lib/api.ts       # cliente único de API: toda llamada al backend pasa por aquí
│   ├── src/lib/auth.tsx     # sesión del panel (token en localStorage, ProveedorAuth/useAuth)
│   ├── src/components/      # PanelLayout (barra lateral), ui.tsx, Graficos, QrCargador
│   ├── src/pages/c/         # app de usuario: pantalla que abre el QR del cargador (sin login)
│   ├── src/pages/carga/     # app de usuario: carga en vivo, pago y recibo (sin login)
│   ├── src/pages/login.tsx, registro.tsx
│   └── src/pages/*/         # panel: inicio, cargadores, sesiones, operadores, facturacion,
│                            # ocpp (consola), usuarios, configuracion
├── docs/                    # especificación técnica y modelo de datos
├── scripts/windows/         # scripts de despliegue para Windows Server
└── ecosystem.config.js      # procesos PM2 (backend + frontend)
```

## Comandos

| Tarea | Backend (`backend/`) | Frontend (`frontend/`) |
|---|---|---|
| Instalar | `npm install` | `npm install` |
| Desarrollo | `npm run start:dev` (ts-node-dev) | `npm run dev` |
| Compilar | `npm run build` → `dist/main.js` | `npm run build` → `.next/` |
| Producción | `node dist/main.js` | `next start -p 3001` |

Producción con PM2, desde la raíz: `pm2 start ecosystem.config.js && pm2 save`.

## Convenciones

- Endpoints REST en español y en plural: `/operadores`, `/cargadores`, `/sesiones`,
  `/facturacion/cobrar`. Campos en `snake_case` (`numero_serie`, `kwh_consumidos`).
- Al agregar o cambiar un endpoint, actualizar **también** `frontend/src/lib/api.ts`
  (tipos y función) para que backend y frontend no se desalineen.
- La comisión nunca va fija en código: viene de `comision_pactada` del operador.
  Es un **porcentaje** (`20` = 20 %), igual en entidad, backend y panel. Sin valor: 20 %.
- Montos en **COP**; formatear en el frontend con `formatoCOP` / `formatoKwh` de `api.ts`.
- `numero_serie` del cargador = `pile_number_master` configurado en el equipo, y es lo que
  va en la URL del QR (`/c/<numero_serie>`).
- La app de usuario (`/c/*`, `/carga/*`) usa `AppUsuarioLayout`, sin login ni menú del panel;
  `/login` y `/registro` van sin barra lateral; el resto usa `PanelLayout` (lo decide `_app.tsx`).
- **Autenticación**: guard global (`AuthGuard`). Toda ruta exige `Authorization: Bearer <token>`
  salvo las marcadas con `@Publico()`. `@Roles('admin')` restringe a administradores.
  Un usuario `operador` solo ve lo de su `operador_id`: en los servicios se pasa
  `alcanceOperador(usuario)` (null = admin, ve todo).
- Rutas solo de admin en el panel: `/ocpp`, `/usuarios`, `/configuracion` (lista `soloAdmin`
  en `PanelLayout`); el backend también las protege con `@Roles('admin')`.
- **Sistema visual** (`globals.css`): tokens `--tinta`, `--panel`, `--voltaje` (ámbar, marca y
  acción principal), `--flujo` (conectado/correcto), `--falla`. Fuente Sora; JetBrains Mono
  solo para datos técnicos (JSON OCPP, números de serie). Colores de gráficos
  `--serie-energia` / `--serie-ingresos`, validados para daltonismo y contraste: no cambiarlos
  sin volver a validarlos. Iconos: `lucide-react`.
- Errores del backend con excepciones de NestJS (`NotFoundException`, `ConflictException`,
  `BadRequestException`) y mensajes en español: la app los muestra tal cual al usuario.
- Puerto del backend configurable con la variable `PORT` (por defecto 3000).
- CORS habilitado en `backend/src/main.ts` porque el frontend llama a la API desde el
  navegador en otro origen (puerto 3001).

## Endpoints

Pública = sin login. Admin = solo administradores. El resto exige login (con alcance de operador).

| Método y ruta | Acceso | Uso |
|---|---|---|
| `POST /auth/login`, `POST /auth/registro` | Pública | Login y autorregistro de operador (empresa + usuario) |
| `GET /auth/yo` | Login | Usuario actual |
| `GET/POST /usuarios`, `PATCH /usuarios/:id/activo` | Admin | Gestión de usuarios |
| `PATCH /usuarios/:id/clave` | Login | Cambiar clave (propia; admin cualquiera) |
| `GET /configuracion/publica` | Pública | URL base del QR y si el registro está abierto |
| `GET/PATCH /configuracion` | Admin | Comisión por defecto, OCPP, RFID, simulación |
| `GET /operadores`, `GET/PATCH /operadores/:id` | Login | `comision_pactada` solo la cambia un admin |
| `POST /operadores` | Admin | |
| `GET/POST /cargadores`, `PATCH/DELETE /cargadores/:numero_serie` | Login | |
| `GET /cargadores/:numero_serie` | Pública | App de usuario (incluye `operador_nombre`) |
| `GET /sesiones`, `GET /estadisticas?dias=14` | Login | Listado y datos del dashboard |
| `GET /sesiones/:id`, `POST /sesiones`, `POST /sesiones/:id/finalizar`, `POST /sesiones/:id/pagar` | Pública | App de usuario (el UUID no es adivinable) |
| `POST /facturacion/cobrar` | Login | Simulador de cobro |
| `GET /ocpp/conexiones` | Login | Cargadores conectados por WebSocket |
| `GET /ocpp/catalogo`, `GET /ocpp/mensajes`, `POST /ocpp/:numero_serie/comandos` | Admin | Consola OCPP |
| `WS /ocpp/:numero_serie` | Cargador | Gateway OCPP 1.6J (subprotocolo `ocpp1.6`) |

## Gateway OCPP 1.6J

- `ocpp-gateway.service.ts`: servidor WebSocket en el mismo puerto de la API. Rechaza
  (404) números de serie no registrados salvo que Configuración lo permita.
- Atiende `BootNotification` (responde la hora: el MDXDC3001 llega con el reloj en el
  año 2000), `Heartbeat`, `StatusNotification` (actualiza el estado del cargador),
  `Authorize`, `StartTransaction`, `MeterValues`, `StopTransaction`, `DataTransfer`.
- Comandos al cargador: catálogo y validación en `ocpp-comandos.ts` (RemoteStart/Stop,
  Reset, ChangeAvailability, Get/ChangeConfiguration, UnlockConnector, TriggerMessage,
  ClearCache, DataTransfer). Para agregar uno: definirlo ahí con plantilla y validador.
- Enlace con sesiones (`ManejadorTransacciones`, lo implementa `SesionesService`):
  la app crea la sesión en `iniciando` con un `idTag` propio (`APP…`) y envía
  `RemoteStartTransaction`; el `StartTransaction` del cargador la pasa a `en_curso`;
  `MeterValues` actualiza kWh; "Detener" envía `RemoteStopTransaction` (`deteniendo`) y el
  `StopTransaction` la cierra con la lectura final. Una tarjeta RFID autorizada crea su
  propia sesión (`origen: 'rfid'`).
- Probar sin el equipo: `node scripts/simulador-ocpp.js ws://localhost:3000/ocpp <serie>`
  (desde `backend/`; teclas `t <tarjeta>`, `s`, `f`, `a`, `q`).

## Estado actual

- **Persistencia temporal en JSON**: cada servicio guarda su colección con `AlmacenService`
  en `backend/data/*.json` (o `DATA_DIR`). Sobrevive a reinicios; no se sube a git. Las
  entidades TypeORM ya existen; al conectar PostgreSQL se reemplaza el `Map` + `almacen` de
  cada servicio por su repositorio (los métodos públicos de los servicios no deben cambiar).
- **Medición simulada**: si el cargador no está conectado por OCPP, los kWh se calculan a la
  potencia simulada (Configuración, por defecto 30 kW). Se apaga en Configuración; la app
  muestra un aviso mientras esté activa. Con el cargador conectado se usan sus `MeterValues`.
- **Pago**: `POST /sesiones/:id/pagar` deja el pago en `pendiente`; no hay cobro real hasta
  integrar Wompi.
- Al registrar un cargador queda `activo`; si se conecta por OCPP, `StatusNotification` lo
  mantiene al día (`Faulted` → `en_falla`, `Unavailable` → `inactivo`).
- Pendientes: PostgreSQL (en la misma VM Windows), Wompi (cobro + dispersión), probar el
  gateway con el MDXDC3001 real, `wss://` (TLS) para producción.

---

## Despliegue en Windows Server 2019

Entorno actual: VM **Windows Server 2019 (español)** sobre Proxmox VE, con acceso remoto
por ZeroTier y SSH. Repo clonado en `C:\Users\Administrador\electrolineras`.

### Requisitos instalados

- **Node.js LTS** (24.x) por MSI desde nodejs.org.
- **Git for Windows**.
- **PM2** global: `npm install -g pm2`, con `PM2_HOME=C:\pm2` a nivel de máquina.
- **OpenSSH Server 10.x** desde GitHub (Win32-OpenSSH), no el que trae Windows.
- **PowerShell 7** (`pwsh`) como shell por defecto de SSH.

### Primera instalación

```powershell
cd C:\Users\Administrador\electrolineras

# Frontend: URL de la API tal como la ve el NAVEGADOR (no "localhost")
Copy-Item frontend\.env.local.example frontend\.env.local
# editar NEXT_PUBLIC_API_URL=http://<IP-del-servidor>:3000

# Backend (opcional): fijar la clave del administrador
Copy-Item backend\.env.example backend\.env
# editar ADMIN_PASSWORD=<clave de al menos 8 caracteres>

powershell -ExecutionPolicy Bypass -File scripts\windows\abrir-puertos.ps1
powershell -ExecutionPolicy Bypass -File scripts\windows\actualizar.ps1
powershell -ExecutionPolicy Bypass -File scripts\windows\instalar-arranque-pm2.ps1
```

### Actualizar después de un cambio en el repo

```powershell
powershell -ExecutionPolicy Bypass -File C:\Users\Administrador\electrolineras\scripts\windows\actualizar.ps1
```

Hace `git pull`, `npm install` y `npm run build` en ambos proyectos, y reinicia PM2.

**Primer acceso al panel**: sin `ADMIN_PASSWORD`, el primer arranque crea
`admin@electrolineras.local` con una clave aleatoria que aparece en el log
(`pm2 logs electrolineras --lines 80 --nostream`, busca "Administrador inicial").
Para restablecerla: pon `ADMIN_PASSWORD` en `backend\.env` y `pm2 restart electrolineras`.

**Conectar el MDXDC3001**: en Basic Settings, `domain_master = ws://<IP-del-servidor>:3000/ocpp`
y `pile_number_master = <numero_serie registrado>`; Save y About → System reset. El puerto
3000 ya está abierto por `abrir-puertos.ps1`. Probar antes con el simulador:
`node backend\scripts\simulador-ocpp.js ws://localhost:3000/ocpp <numero_serie>`.

### Comandos útiles

```powershell
$env:PM2_HOME = 'C:\pm2'
pm2 list
pm2 logs electrolineras --lines 30 --nostream
pm2 logs electrolineras-front --lines 30 --nostream
pm2 restart electrolineras
```

### Problemas conocidos en Windows (y su solución)

| Síntoma | Causa | Solución |
|---|---|---|
| `EADDRINUSE :::3000` y el proceso queda `stopped` en PM2 | Quedó corriendo un `npm run start:dev` | Cerrarlo, `pm2 restart electrolineras`, `pm2 save` |
| `pm2 resurrect` restaura el proceso detenido | Se hizo `pm2 save` con el proceso en `stopped` | Arrancarlo y volver a ejecutar `pm2 save` |
| Next arranca en modo dev ("Compiling...", "trying 3001") | PM2 en Windows no pasa bien `-- start -p 3001` | Usar `ecosystem.config.js` (argumentos en `args`) |
| `pm2 startup` no funciona | PM2 no lo soporta en Windows | Tarea programada: `scripts/windows/instalar-arranque-pm2.ps1` |
| `Invoke-WebRequest` muy lento | Barra de progreso de PowerShell 5.1 | `$ProgressPreference = 'SilentlyContinue'` o `curl.exe` |
| SSH acepta la contraseña y cierra la sesión | ConPTY de Server 2019 sin actualizar | Actualizar Windows; mientras tanto `ssh -T` |
| `sshd` desaparece tras reinstalar OpenSSH | Al quitar la versión integrada se borra el servicio | `New-Service -Name sshd -BinaryPathName '"C:\Program Files\OpenSSH\sshd.exe"' -StartupType Automatic` |
| `sconfig` busca `en-US\sconfig.vbs` | Bug del Windows en español | `cscript C:\Windows\System32\es-ES\sconfig.vbs` |
| Errores de CORS en el navegador | Backend sin `enableCors()` | Ya resuelto en `backend/src/main.ts` |
| No sé la clave del admin | Se generó al primer arranque | `pm2 logs electrolineras --lines 80 --nostream`, o `ADMIN_PASSWORD` en `backend\.env` |
| El cargador no conecta (404) | Su número de serie no está registrado | Registrarlo en Cargadores con el mismo `pile_number_master` |
| Al pegar varios comandos se juntan líneas | El último renglón pegado queda sin Enter | Pegar de a un comando, o unirlos con `;` |

### Alternativa recomendada a futuro

Para este stack (NestJS + Next.js + PostgreSQL), un contenedor **LXC Ubuntu/Debian** en el
mismo Proxmox es más liviano y simple: `pm2 startup` funciona nativo, `ufw` para el
firewall y no hay ninguno de los ajustes de la tabla anterior. El código del proyecto
(CORS, `.env.local`, builds, puertos) es el mismo en ambos sistemas.
