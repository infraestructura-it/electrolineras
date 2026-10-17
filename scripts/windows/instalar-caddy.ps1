<#
Instala Caddy como servicio de Windows y publica Electrolineras con HTTPS (certificados de
Let's Encrypt automáticos y renovados por Caddy).

  https://cargador.infraestructura-it.com   -> panel y app (3001), API en /api (3000),
                                              cargadores por wss://…/ocpp/<serie> (3000)
  https://pagos.infraestructura-it.com      -> API (3000): confirmaciones de la pasarela (webhooks)

Antes de correrlo:
  1. DNS: registros A de los dos subdominios hacia la IP pública de la oficina.
  2. Router: reenviar los puertos 80 y 443 (TCP) a esta VM.
  (Los puertos 3000/3001 por IP o ZeroTier siguen funcionando como hasta ahora.)

Uso (PowerShell como Administrador):
  powershell -ExecutionPolicy Bypass -File C:\Users\Administrador\electrolineras\scripts\windows\instalar-caddy.ps1 -Correo jairosepulvedac@gmail.com

Opciones:
  -Dominio cargador.infraestructura-it.com   dominio del panel / app / cargadores
  -DominioPagos pagos.infraestructura-it.com dominio de la API para la pasarela ('' para omitirlo)
  -Correo <email>                            aviso de Let's Encrypt si un certificado tiene problemas
  -Version 2.10.2                            versión de Caddy (por defecto la última)
  -Desinstalar                               quita el servicio (deja C:\caddy con sus datos)

Archivos: C:\caddy\caddy.exe, C:\caddy\Caddyfile, C:\caddy\caddy.log, certificados en C:\caddy\datos
#>
[CmdletBinding()]
param(
    [string]$Dominio = 'cargador.infraestructura-it.com',
    [string]$DominioPagos = 'pagos.infraestructura-it.com',
    [string]$Correo = '',
    [string]$Version = '',
    [string]$Carpeta = 'C:\caddy',
    [switch]$Desinstalar
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Ejecuta este script en una consola de PowerShell como Administrador.'
}

$exe = Join-Path $Carpeta 'caddy.exe'
$caddyfile = Join-Path $Carpeta 'Caddyfile'
$servicio = 'caddy'

function Exigir($paso) { if ($LASTEXITCODE -ne 0) { throw "Falló: $paso (código $LASTEXITCODE)" } }

# ---------- Desinstalar ----------
if ($Desinstalar) {
    if (Get-Service $servicio -ErrorAction SilentlyContinue) {
        Stop-Service $servicio -ErrorAction SilentlyContinue
        sc.exe delete $servicio | Out-Null
        Write-Host "Servicio '$servicio' eliminado. $Carpeta se conserva (certificados y configuración)."
    } else {
        Write-Host "No hay servicio '$servicio' instalado."
    }
    exit 0
}

if ($Carpeta -match '\s') { throw "La carpeta de Caddy no puede tener espacios: $Carpeta" }
New-Item -ItemType Directory -Force -Path $Carpeta, (Join-Path $Carpeta 'datos') | Out-Null

# ---------- 1. Descargar Caddy (release oficial de GitHub) ----------
if (Test-Path $exe) {
    Write-Host "==> Caddy ya está en $exe ($((& $exe version) -split ' ' | Select-Object -First 1))"
} else {
    Write-Host '==> Descargando Caddy'
    $api = if ($Version) { "https://api.github.com/repos/caddyserver/caddy/releases/tags/v$Version" } else { 'https://api.github.com/repos/caddyserver/caddy/releases/latest' }
    $release = Invoke-RestMethod -Uri $api -Headers @{ 'User-Agent' = 'electrolineras' } -TimeoutSec 60
    $activo = $release.assets | Where-Object { $_.name -match '^caddy_.+_windows_amd64\.zip$' } | Select-Object -First 1
    if (-not $activo) { throw "No se encontró el paquete de Windows en la versión $($release.tag_name)." }
    $zip = Join-Path $env:TEMP $activo.name
    Invoke-WebRequest -Uri $activo.browser_download_url -OutFile $zip -UseBasicParsing -TimeoutSec 300
    $tmp = Join-Path $env:TEMP 'caddy-extraer'
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    Expand-Archive -Path $zip -DestinationPath $tmp -Force
    Copy-Item (Join-Path $tmp 'caddy.exe') $exe -Force
    Remove-Item $zip, $tmp -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "    Caddy $($release.tag_name) instalado en $exe"
}

# ---------- 2. Caddyfile ----------
Write-Host "==> Escribiendo $caddyfile"
$datos = (Join-Path $Carpeta 'datos') -replace '\\', '/'
$log = (Join-Path $Carpeta 'caddy.log') -replace '\\', '/'
$global = @('{')
if ($Correo) { $global += "    email $Correo" }
$global += @(
    '    storage file_system {'
    "        root $datos"
    '    }'
    '    log {'
    "        output file $log {"
    '            roll_size 10MiB'
    '            roll_keep 5'
    '        }'
    '    }'
    '}'
)
$sitio = @"

# Panel, app del conductor, API (/api) y cargadores (wss://$Dominio/ocpp/<serie>)
$Dominio {
    encode gzip

    # Cargadores OCPP: solo las conexiones WebSocket (la página /ocpp del panel va al frontend)
    @ocpp {
        path /ocpp/*
        header Connection *Upgrade*
        header Upgrade websocket
    }
    handle @ocpp {
        reverse_proxy localhost:3000
    }

    # API: el frontend la llama en /api cuando la página se abre por HTTPS
    handle_path /api/* {
        reverse_proxy localhost:3000
    }

    # Panel y app (Next.js)
    handle {
        reverse_proxy localhost:3001
    }
}
"@
if ($DominioPagos) {
    $sitio += @"

# API para la pasarela de pagos (confirmaciones / webhooks)
$DominioPagos {
    reverse_proxy localhost:3000
}
"@
}
$contenido = ($global -join "`r`n") + "`r`n" + $sitio
[System.IO.File]::WriteAllText($caddyfile, $contenido, (New-Object System.Text.UTF8Encoding($false)))

& $exe fmt --overwrite $caddyfile | Out-Null
& $exe validate --config $caddyfile --adapter caddyfile
Exigir 'validar el Caddyfile'

# ---------- 3. Firewall ----------
Write-Host '==> Abriendo puertos 80 y 443 en el firewall de Windows'
foreach ($p in 80, 443) {
    $nombre = "Caddy HTTP/HTTPS $p"
    if (-not (Get-NetFirewallRule -DisplayName $nombre -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -DisplayName $nombre -Direction Inbound -Protocol TCP -LocalPort $p -Action Allow | Out-Null
    }
}

# ---------- 4. Servicio de Windows ----------
# Sin comillas internas: PowerShell 5.1 las pierde al pasarlas a sc.exe (por eso la carpeta no admite espacios).
$binPath = "$exe run --config $caddyfile --adapter caddyfile"
if (Get-Service $servicio -ErrorAction SilentlyContinue) {
    Write-Host '==> Actualizando el servicio caddy'
    Stop-Service $servicio -ErrorAction SilentlyContinue
    sc.exe config $servicio binPath= $binPath start= auto | Out-Null
} else {
    Write-Host '==> Creando el servicio caddy (arranque automático)'
    sc.exe create $servicio binPath= $binPath start= auto DisplayName= 'Caddy (HTTPS Electrolineras)' | Out-Null
    Exigir 'crear el servicio'
    sc.exe description $servicio 'Proxy HTTPS de Electrolineras: certificados de Let''s Encrypt y reenvío a los puertos 3000/3001.' | Out-Null
    # Si se cae, reiniciarlo a los 5 s.
    sc.exe failure $servicio reset= 86400 actions= restart/5000/restart/5000/restart/5000 | Out-Null
}
Start-Service $servicio
Start-Sleep -Seconds 3
$estado = (Get-Service $servicio).Status
Write-Host "    Servicio caddy: $estado"
if ($estado -ne 'Running') { throw "Caddy no arrancó. Revisa $log" }

# ---------- 5. Comprobación ----------
Write-Host ''
Write-Host '==> Comprobando los certificados (puede tardar hasta 1 minuto la primera vez)…'
$dominios = @($Dominio) + @(if ($DominioPagos) { $DominioPagos })
foreach ($d in $dominios) {
    $ok = $false
    for ($i = 0; $i -lt 12 -and -not $ok; $i++) {
        try {
            $r = Invoke-WebRequest -Uri "https://$d/" -UseBasicParsing -TimeoutSec 10 -MaximumRedirection 0 -ErrorAction Stop
            $ok = $true
        } catch {
            if ($_.Exception.Response) { $ok = $true } else { Start-Sleep -Seconds 5 }  # respondió (aunque sea 404): HTTPS listo
        }
    }
    if ($ok) { Write-Host "    OK  https://$d" -ForegroundColor Green }
    else { Write-Host "    ... https://$d aún no responde" -ForegroundColor Yellow }
}

Write-Host ''
Write-Host 'Siguiente:'
Write-Host "  - Panel: https://$Dominio  ->  Configuración -> URL pública: https://$Dominio (para los QR)"
Write-Host "  - Cargadores (cuando el equipo lo permita): domain_master = wss://$Dominio/ocpp"
Write-Host "  - Registro de Caddy: $log"
Write-Host '  Si un dominio no responde: revisa el registro A del DNS y que el router reenvíe 80 y 443 a esta VM.'
Write-Host '  Si aquí falla pero desde el celular con datos móviles abre bien, es el router (no permite'
Write-Host '  entrar a la IP pública desde la misma red): todo está bien, prueba siempre desde afuera.'
