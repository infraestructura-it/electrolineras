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
│   │                        # facturacion, proformas, ocpp-gateway
│   └── .env.example         # ADMIN_EMAIL, ADMIN_PASSWORD, JWT_SECRET, DATA_DIR, PORT
├── frontend/                # Next.js 14 (pages router) — puerto 3001 en producción
│   ├── src/lib/api.ts       # cliente único de API: toda llamada al backend pasa por aquí
│   ├── src/lib/auth.tsx     # sesión del panel (token en localStorage, ProveedorAuth/useAuth)
│   ├── src/components/      # PanelLayout (barra lateral), ui.tsx, Graficos, QrCargador,
│   │                        # DocumentoProforma + HojaEscalada (formato carta de la proforma)
│   ├── src/pages/c/         # app de usuario: pantalla que abre el QR del cargador (sin login)
│   ├── src/pages/carga/     # app de usuario: carga en vivo, pago y recibo (sin login)
│   ├── src/pages/p/         # documento público de una proforma (lo abre su QR, sin login)
│   ├── src/pages/login.tsx, registro.tsx
│   └── src/pages/*/         # panel: inicio, cargadores, sesiones, operadores, proformas,
│                            # facturacion, ocpp (consola), usuarios, configuracion
├── simulador/               # simulador OCPP del MDXDC3001, independiente (solo depende de ws)
├── docs/                    # especificación técnica y modelo de datos
├── scripts/proxmox/         # crear-lxc.sh (contenedor Ubuntu 24.04) y migrar-datos.sh
├── scripts/linux/           # instalar.sh y actualizar.sh (Ubuntu 24.04, PM2 + systemd)
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
| `GET /proformas?estado=&q=`, `GET /proformas/:id`, `POST /proformas` | Login | Listado, detalle y emisión desde una sesión |
| `POST /proformas/:id/anular` | Admin | Anular con motivo (el número no se reutiliza) |
| `GET /proformas/verificar/:codigo` | Pública | Documento por código de verificación (QR) |
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
- Probar sin el equipo: carpeta `simulador/` (ver su README): `npm install` y
  `npm start -- ws://<servidor>:3000/ocpp/ws <serie>` (teclas `t <tarjeta>`, `s`, `f`, `a`, `q`).
  Corre en cualquier equipo con Node 18+, sin instalar el backend.

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
  gateway con el MDXDC3001 real, `wss://` (TLS) para producción, envío de la proforma por
  correo, factura electrónica DIAN a través de un proveedor tecnológico.

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
