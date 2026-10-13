# CLAUDE.md — Electrolineras

Guía para Claude (y para cualquier persona) que trabaje en este repositorio.
Idioma del proyecto: **español** (código, comentarios, commits y documentación).

## Qué es

Plataforma de gestión y facturación de cargadores eléctricos DC. Un **operador** registra
sus cargadores, define tarifas y factura a los usuarios finales; la plataforma retiene una
comisión configurable por operador. Hardware de referencia: cargador DC 30 kW **MDXDC3001**
(OCPP 1.6 JSON, versión por confirmar con el fabricante). Detalle completo en
`docs/especificacion-tecnica.md`.

## Estructura

```
electrolineras/
├── backend/                 # API NestJS 10 (TypeScript) — puerto 3000
│   └── src/modules/         # operadores, cargadores, sesiones, facturacion, ocpp-gateway
├── frontend/                # Next.js 14 (pages router) — puerto 3001 en producción
│   └── src/lib/api.ts       # cliente único de API: toda llamada al backend pasa por aquí
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
- Puerto del backend configurable con la variable `PORT` (por defecto 3000).
- CORS habilitado en `backend/src/main.ts` porque el frontend llama a la API desde el
  navegador en otro origen (puerto 3001).

## Estado actual

- Los servicios guardan los datos **en memoria**: se pierden al reiniciar el backend.
  Las entidades TypeORM ya existen, pero PostgreSQL aún no está conectado.
- Pendientes: conectar PostgreSQL, integrar Wompi (cobro + dispersión), confirmar versión
  OCPP del MDXDC3001 y conectar el gateway al cargador real, autenticación.

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

powershell -ExecutionPolicy Bypass -File scripts\windows\abrir-puertos.ps1
powershell -ExecutionPolicy Bypass -File scripts\windows\actualizar.ps1
powershell -ExecutionPolicy Bypass -File scripts\windows\instalar-arranque-pm2.ps1
```

### Actualizar después de un cambio en el repo

```powershell
powershell -ExecutionPolicy Bypass -File C:\Users\Administrador\electrolineras\scripts\windows\actualizar.ps1
```

Hace `git pull`, `npm install` y `npm run build` en ambos proyectos, y reinicia PM2.

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
| Al pegar varios comandos se juntan líneas | El último renglón pegado queda sin Enter | Pegar de a un comando, o unirlos con `;` |

### Alternativa recomendada a futuro

Para este stack (NestJS + Next.js + PostgreSQL), un contenedor **LXC Ubuntu/Debian** en el
mismo Proxmox es más liviano y simple: `pm2 startup` funciona nativo, `ufw` para el
firewall y no hay ninguno de los ajustes de la tabla anterior. El código del proyecto
(CORS, `.env.local`, builds, puertos) es el mismo en ambos sistemas.
