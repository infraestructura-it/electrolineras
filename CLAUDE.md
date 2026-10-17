# CLAUDE.md — Electrolineras

Guía para Claude (y para cualquier persona) que trabaje en este repositorio.
Idioma del proyecto: **español** (código, comentarios, commits y documentación).

## Qué es

Plataforma de gestión y facturación de cargadores eléctricos DC. Una **empresa** (operador)
registra sus electrolineras y cargadores, define tarifas y factura a los conductores; la
plataforma retiene una comisión configurable por empresa. Hardware de referencia: cargador DC
30 kW **MDXDC3001**, **OCPP 1.6J** (`ws`/`wss`, confirmado en el manual), conector CCS2, RFID y QR.
El gateway también habla **OCPP 2.0.1** (seleccionable por cargador). Detalle completo
y configuración del cargador en `docs/especificacion-tecnica.md` (secciones 8 y 9).

## Estructura

```
electrolineras/
├── backend/                 # API NestJS 10 (TypeScript) — puerto 3000 (API + gateway OCPP)
│   ├── src/comun/           # AlmacenService (persistencia JSON), decoradores @Publico/@Roles/@Usuario
│   ├── src/modules/         # auth (+ huella), usuarios, configuracion, operadores (empresas),
│   │                        # zonas, electrolineras, cargadores, sesiones, monitor, facturacion,
│   │                        # proformas, licencias, conductores (app + puntos), ocpp-gateway
│   ├── licencia-publica.pem # (cuando IIT la publique) activa el licenciamiento
│   └── .env.example         # ADMIN_EMAIL, ADMIN_PASSWORD, JWT_SECRET, DATA_DIR, PORT
├── frontend/                # Next.js 14 (pages router) — puerto 3001 en producción
│   ├── src/lib/api.ts       # cliente único de API: toda llamada al backend pasa por aquí
│   ├── src/lib/auth.tsx     # sesión del panel (token en localStorage, ProveedorAuth/useAuth)
│   ├── src/components/      # PanelLayout (barra lateral), ui.tsx, Graficos, QrCargador, Mapa
│   │                        # (Leaflet, carga dinámica), DocumentoProforma + HojaEscalada
│   ├── src/pages/app/       # app del conductor: mapa, entrar/registro, cuenta y puntos
│   ├── src/pages/c/         # app de usuario: pantalla que abre el QR del cargador (sin login)
│   ├── src/pages/carga/     # app de usuario: carga en vivo, pago (con puntos) y recibo
│   ├── src/pages/p/         # documento público de una proforma (lo abre su QR, sin login)
│   ├── src/pages/login.tsx, registro.tsx
│   ├── src/pages/monitor/   # estado de cargadores en vivo, pantalla completa (otra pestaña)
│   └── src/pages/*/         # panel: inicio, electrolineras, zonas, cargadores, sesiones,
│                            # operadores (Empresas), proformas, facturacion, ocpp (consola),
│                            # usuarios, licencias, cuenta (huella y clave), configuracion
├── simulador/               # simulador OCPP 1.6J/2.0.1 del MDXDC3001 (solo depende de ws)
├── herramientas/licencias/  # licencias-iit.js: llaves y emisión de licencias (solo IIT)
├── package.json             # atajo: `npm start -- <url> <serie>` en la raíz corre el simulador
├── docs/                    # especificación técnica y modelo de datos
├── scripts/proxmox/         # crear-lxc.sh (contenedor Ubuntu 24.04) y migrar-datos.sh
├── scripts/linux/           # instalar.sh y actualizar.sh (Ubuntu 24.04, PM2 + systemd)
├── scripts/windows/         # despliegue en Windows Server y simular-cargadores.ps1 (flota de prueba)
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
- La app de usuario (`/c/*`, `/carga/*`, `/app*`) usa `AppUsuarioLayout`, sin login del panel;
  `/login`, `/registro` y `/monitor` van sin barra lateral; el resto usa `PanelLayout` (`_app.tsx`).
- **Autenticación**: guard global (`AuthGuard`). Toda ruta exige `Authorization: Bearer <token>`
  salvo las marcadas con `@Publico()`. `@Roles(...)` restringe por rol.
- **Jerarquía y roles** (`comun/decoradores.ts`): Zona → Empresa → Electrolinera → Cargador.
  - `admin`: la plataforma (IIT), ve todo.
  - `administrador`: administrador de una empresa (gestiona sus electrolineras, cargadores,
    usuarios y proformas). El antiguo rol `operador` se migra solo a `administrador`.
  - `operario`: de una empresa, opcionalmente limitado a una zona (`zona_id`); opera y consulta,
    no crea ni edita. `GESTION = ['admin', 'administrador']`.
  - En los servicios se pasa `alcanceOperador(usuario)` (null = admin) y, para el operario,
    `alcanceZona(usuario)` → `cargadores.seriesVisibles(...)`.
- El menú del panel se arma por rol en `PanelLayout`; el backend protege igual con `@Roles`.
- La app del conductor tiene **su propio token** (tipo `conductor`, 60 días, clave
  `electrolineras:conductor` en el navegador). `AuthService.verificar()` lo rechaza para el panel;
  en `api.ts` se envía con `request(..., 'conductor')`.
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
| `GET /auth/huella`, `POST /auth/huella/registro/opciones`, `POST /auth/huella/registro`, `DELETE /auth/huella/:id` | Login | Huellas (passkeys) del usuario |
| `POST /auth/huella/login/opciones`, `POST /auth/huella/login` | Pública | Entrar con huella |
| `GET/POST /usuarios`, `PATCH /usuarios/:id`, `PATCH /usuarios/:id/activo` | Gestión | Usuarios de la empresa (admin: todos) |
| `PATCH /usuarios/:id/clave` | Login | Cambiar clave (propia; admin cualquiera) |
| `GET /configuracion/publica` | Pública | URL base del QR y si el registro está abierto |
| `GET/PATCH /configuracion` | Admin | Comisión por defecto, OCPP, RFID, simulación |
| `GET /operadores`, `GET /operadores/:id` | Login | Empresas |
| `PATCH /operadores/:id` | Gestión | `comision_pactada` solo la cambia un admin; `puntos` = programa de puntos |
| `POST /operadores` | Admin | |
| `GET /zonas` · `POST/PATCH/DELETE /zonas/:id` | Login · Admin | Zonas |
| `GET /electrolineras[/:id]` · `POST/PATCH/DELETE` | Login · Gestión | Sitios con latitud/longitud |
| `GET /monitor` | Login | Tablero en vivo (estado de conectores y sesiones activas) |
| `GET /mapa` | Pública | Electrolineras con la disponibilidad de cada cargador (app del conductor) |
| `GET/POST /cargadores`, `PATCH/DELETE /cargadores/:numero_serie` | Login | `electrolinera_id`, `version_ocpp`, `potencia_kw` |
| `GET /cargadores/:numero_serie` | Pública | App de usuario (incluye `operador_nombre`) |
| `GET /sesiones`, `GET /estadisticas?dias=14` | Login | Listado y datos del dashboard |
| `GET /sesiones/:id`, `POST /sesiones`, `POST /sesiones/:id/finalizar`, `POST /sesiones/:id/pagar` | Pública | App de usuario (el UUID no es adivinable). Con token de conductor: la carga queda en su cuenta y `pagar {usar_puntos}` redime |
| `POST /conductor/registro`, `POST /conductor/login` | Pública | Cuenta del conductor (devuelve su token) |
| `GET /conductor/yo`, `/conductor/cargas`, `/conductor/puntos` | Conductor | Perfil, historial y puntos |
| `GET /conductor/programa/:numero_serie` | Pública | Programa de puntos del cargador (+ saldo si hay token) |
| `GET /licencias` · `POST /licencias` · `DELETE /licencias/:id` | Login · Gestión · Admin | Resumen, activar y quitar licencias |
| `POST /facturacion/cobrar` | Login | Simulador de cobro |
| `GET /proformas?estado=&q=`, `GET /proformas/:id`, `POST /proformas` | Login | Listado, detalle y emisión desde una sesión |
| `POST /proformas/:id/anular` | Admin | Anular con motivo (el número no se reutiliza) |
| `GET /proformas/verificar/:codigo` | Pública | Documento por código de verificación (QR) |
| `GET /ocpp/conexiones` | Login | Cargadores conectados por WebSocket |
| `GET /ocpp/catalogo?version=`, `GET /ocpp/mensajes`, `POST /ocpp/:numero_serie/comandos` | Admin | Consola OCPP (catálogo según la versión del cargador) |
| `WS /ocpp/:numero_serie` | Cargador | Gateway OCPP (subprotocolo `ocpp1.6` u `ocpp2.0.1`) |

## Gateway OCPP (1.6J y 2.0.1)

- `ocpp-gateway.service.ts`: servidor WebSocket en el mismo puerto de la API. Rechaza
  (404) números de serie no registrados salvo que Configuración lo permita.
- **Versión**: cada cargador tiene `version_ocpp` = `auto` (por defecto: se negocia por el
  subprotocolo WebSocket que ofrezca el equipo, prefiriendo 2.0.1), `1.6` o `2.0.1` (fija: si el
  equipo no la ofrece, se rechaza el handshake). El MDXDC3001 habla 1.6J.
- En 2.0.1 se atiende `BootNotification`, `Heartbeat`, `StatusNotification` (`connectorStatus`,
  se traduce al vocabulario 1.6 con `STATUS_201`), `Authorize` (`idToken`), `TransactionEvent`
  (Started/Updated/Ended; `transactionId` es texto) y `MeterValues` (`unitOfMeasure.multiplier`).
  Inicio/fin remotos con `RequestStart/StopTransaction` vía `iniciarRemoto`/`detenerRemoto`, que
  eligen el mensaje según la versión. Catálogos de la consola: `CATALOGO_16` y `CATALOGO_201`.
- El % de batería (`SoC`) que informe el cargador va a `soc_pct` y la app lo muestra en el anillo.
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
  propia sesión (`origen: 'rfid'`). Un `RemoteStartTransaction` enviado desde la consola OCPP
  deja su `idTag` aceptado 5 minutos para ese cargador y crea una sesión `origen: 'panel'`.
- Transacciones huérfanas (el cargador se reinició y no envió `StopTransaction`): si el conector
  queda `Available`/`Finishing` 90 s con la sesión abierta, una revisión cada 30 s la cierra con la
  última lectura; y si "Detener" recibe `Rejected` con el conector libre, se cierra al instante.
  La hora de fin es la del `StopTransaction` (reloj del cargador), no la de llegada del mensaje.
- Probar sin el equipo: carpeta `simulador/` (ver su README): `npm install` y
  `npm start -- ws://<servidor>:3000/ocpp/ws <serie> [--ocpp 2.0.1] [--soc 20]` (teclas `t <tarjeta>`, `s`, `f`, `a`,
  `c [seg]` corte de red, `x` reinicio que pierde la transacción, `q`).
  Corre en cualquier equipo con Node 18+, sin instalar el backend. `--auto` lo pone a cargar solo.
- Flota de prueba: `scripts/windows/simular-cargadores.ps1` (10 cargadores `SIM01…SIM10` en modo
  automático, `-Registrar` los da de alta, `-Estado`, `-Detener` con apagado ordenado). Los arranca
  con WMI (`Win32_Process.Create`) para que sigan vivos al cerrar la sesión SSH.

## Proformas (prefacturas)

- `proformas.service.ts`: emite una proforma por sesión finalizada. Automática al pagar en la
  app (consumidor final, documento `222222222222`, gancho `registrarProformas` de
  `SesionesService`); manual desde Sesiones con datos del cliente y retenciones opcionales.
- Consecutivo: `prefijo-000001`, reservado en `ConfiguracionService.reservarConsecutivo()`
  antes de emitir (un corte salta un número pero nunca lo repite). No se puede bajar por
  debajo del último emitido con el mismo prefijo.
- Cálculo: la tarifa por kWh incluye IVA (precio al consumidor final), así que
  `subtotal = total / (1 + IVA)`. Retenciones: RteFuente y ReteICA (por mil) sobre el
  subtotal, ReteIVA sobre el IVA. Total menos retenciones redondeado a pesos.
  `valor-en-letras.ts` convierte el neto a letras ("… PESOS M/CTE").
- Cada proforma copia emisor, cliente, líneas y totales al emitirse: cambiar la
  parametrización no altera las ya emitidas. Anular conserva el número y deja un sello.
- QR: `<url pública>/p/<codigo_verificacion>` (12 hex). Formato carta (816×1056 px) que
  sigue la factura de referencia; se imprime o guarda como PDF con el diálogo del navegador.
- Parametrización en Configuración → Proformas: emisor, texto legal, prefijo, consecutivo,
  IVA, retenciones, código/descripción del producto, forma de pago, vencimiento, nota al pie.
- No es factura electrónica DIAN (no hay CUFE ni validación): la nota al pie lo indica.

## Electrolineras, mapa y monitor

- Una electrolinera es un sitio (`nombre`, `direccion`, `ciudad`, `latitud`, `longitud`, `horario`,
  `zona_id`) con varios cargadores (`cargador.electrolinera_id`). Se ubica en el panel con un mapa
  (clic o arrastrar el pin), búsqueda de direcciones (Nominatim) o la ubicación del navegador.
- Mapas con Leaflet + react-leaflet y teselas de CARTO (sin llave de API). Usar siempre
  `components/Mapa` (carga dinámica, `ssr: false`), nunca `MapaBase` directo.
- **Monitor** (`/monitor`): pantalla completa que se abre en otra pestaña; estado de cada conector
  (disponible, cargando, falla, sin conexión), sesión activa, kW y kWh, refresco automático.

## Huella (WebAuthn / passkeys)

- `huella.service.ts` con `@simplewebauthn/server`; credenciales en `data/credenciales-huella.json`.
  Cada usuario registra su huella o rostro del celular/PC en **Mi cuenta** y luego usa
  "Entrar con huella" en el login. La huella no sale del dispositivo: se guarda una llave pública.
- El `rpID` sale del `Origin` de la petición: la credencial queda atada al dominio con que se
  registró. **Exige HTTPS** (o `localhost`): con `http://<IP>` el navegador no ofrece la huella y
  el login lo explica. Para producción: dominio con TLS (pendiente junto con `wss://`).

## Licencias de activación

- Por empresa (NIT) con límite de cargadores y vencimiento, firmadas con Ed25519 por IIT
  (`herramientas/licencias/`, ver su README). El servidor solo tiene la llave pública
  (`backend/licencia-publica.pem` o `LICENCIA_CLAVE_PUBLICA`); **sin ella el licenciamiento está
  desactivado** y el panel lo avisa. La llave privada nunca va al repositorio.
- `licencias.service.ts` registra validadores en `CargadoresService` (alta), `OcppGatewayService`
  (`BootNotification` → `Rejected`) y `SesionesService` (inicio). Estados: `sin_control`,
  `sin_licencia`, `vigente`, `por_vencer` (30 días), `en_gracia` (7 días), `vencida`. Si hay más
  cargadores que el límite, quedan fuera los últimos registrados.

## App del conductor y puntos

- `/app`: mapa de electrolineras (`GET /mapa`) con disponibilidad, lista por distancia, filtros
  "Con cargador libre" y "Mis cargadores" (donde ya cargó), enlace "Cómo llegar" (Google Maps).
  `/app/entrar` (login/registro), `/app/cuenta` (saldo, ahorro, movimientos, historial).
- Cuentas en `data/conductores.json` (`ConductoresService`, clave con scrypt). Si el conductor
  inicia una carga con su cuenta abierta, la sesión guarda `conductor_id` y su correo como contacto.
- **Puntos** (`PuntosService`, libro `data/puntos.json`, implementa `ProgramaIncentivos` de
  `SesionesService`). Cada empresa define `puntos: {activo, puntos_por_kwh, valor_punto_cop,
  minimo_canje}` (por defecto 1 pt/kWh, $50 por punto, mínimo 20). Se acumulan al pagar
  (`floor(kWh × puntos_por_kwh)`) y **solo se redimen en cargadores de la empresa que los dio**.
  Al pagar con `usar_puntos` se usan los puntos necesarios sin pasar del total; el cobro (y la base
  de la comisión) es `costo_total − descuento`; si el cobro falla, los puntos se devuelven
  (`reverso`). La proforma muestra el descuento (desagregando el IVA).

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
- Pendientes: PostgreSQL, Wompi (cobro + dispersión), probar el gateway con el MDXDC3001 real,
  dominio con TLS (`https://` para la huella y `wss://` para los cargadores), publicar la llave
  pública de licencias, envío de la proforma por correo, factura electrónica DIAN a través de un
  proveedor tecnológico, probar OCPP 2.0.1 con un equipo real.

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
`cd simulador; npm install; npm start -- ws://localhost:3000/ocpp/ws <numero_serie>`.

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
| `actualizar.ps1` falla en PM2 con `ConvertFrom-Json ... 'username' y 'USERNAME' duplicadas` | La versión anterior leía `pm2 jlist` y el entorno de Windows repite claves | Ya resuelto: el script usa `pm2 startOrReload`. Si quedó a medias: `pm2 startOrReload ecosystem.config.js --update-env; pm2 save` |
| `npm start` del simulador: `Could not read package.json` | Se corrió en la raíz con una versión anterior del repo | `git pull`: ahora `npm start -- <url> <serie>` funciona también desde la raíz (instala y corre `simulador/`) |
| Al pegar varios comandos se juntan líneas | El último renglón pegado queda sin Enter | Pegar de a un comando, o unirlos con `;` |

---

## Despliegue en contenedor LXC Ubuntu 24.04 (Proxmox) — recomendado

Más liviano que la VM Windows y sin los ajustes de la tabla anterior. La app corre con el
usuario de sistema `electro` en `/opt/electrolineras`, PM2 bajo systemd (`pm2-electro.service`).

### Crear el contenedor (en la shell del host Proxmox, como root)

```bash
IP=192.168.2.50/24 GW=192.168.2.1 \
  bash <(curl -fsSL https://raw.githubusercontent.com/infraestructura-it/electrolineras/main/scripts/proxmox/crear-lxc.sh)
```

- Descarga la plantilla `ubuntu-24.04-standard`, crea un contenedor sin privilegios con
  `nesting=1`, 2 CPU, 2 GB de RAM, 16 GB de disco, arranque automático y zona horaria Bogotá.
- Dentro instala Node.js 24 (NodeSource), PM2, clona el repo, crea `backend/.env` y
  `frontend/.env.local` (con la IP del contenedor), compila, arranca y abre 22/3000/3001 en ufw.
- Al final muestra la IP, la clave de root y la del admin del panel: **solo se muestran una vez**.
- Variables: `CTID`, `NOMBRE`, `IP` (`dhcp` o IP/máscara), `GW`, `PUENTE`, `ALMACEN`, `DISCO`,
  `RAM`, `CPUS`, `ADMIN_PASSWORD`, `ZT_RED` (ID de red ZeroTier: habilita `/dev/net/tun` y se une).

### Operación

```bash
pct exec <CTID> -- /opt/electrolineras/scripts/linux/actualizar.sh     # actualizar desde GitHub
pct exec <CTID> -- runuser -u electro -- pm2 list                      # estado
pct exec <CTID> -- runuser -u electro -- pm2 logs electrolineras --lines 50 --nostream
pct enter <CTID>                                                       # shell del contenedor
```

`instalar.sh` es idempotente: correrlo de nuevo actualiza el código y conserva `.env` y datos.

### Migrar los datos desde la VM Windows

1. En la VM Windows, detener la app para que no cambien los datos:
   `$env:PM2_HOME='C:\pm2'; pm2 stop all`
2. Copiar la carpeta de datos al host Proxmox:
   `scp -r C:\Users\Administrador\electrolineras\backend\data root@<IP-proxmox>:/root/electrolineras-data`
3. En el host Proxmox:
   `bash <(curl -fsSL https://raw.githubusercontent.com/infraestructura-it/electrolineras/main/scripts/proxmox/migrar-datos.sh) <CTID> /root/electrolineras-data`
   (respalda los datos del contenedor, copia los `.json` y reinicia la app).
4. La clave del admin pasa a ser la de `backend/.env` del contenedor.
5. Cambiar a la nueva IP: `domain_master` del cargador (`ws://<IP-contenedor>:3000/ocpp`) y
   Configuración → URL pública (`http://<IP-contenedor>:3001`). Los QR impresos con la IP
   anterior dejan de funcionar: reimprimirlos, o dar al contenedor la misma IP que tenía la VM.
6. Cuando todo funcione, apagar la VM Windows o deshabilitar su tarea "PM2 Electrolineras".
