<#
Simula una flota de cargadores MDXDC3001 contra la plataforma (por defecto 10: SIM01 … SIM10).

Cada cargador es un proceso del simulador (simulador\simulador-ocpp.js). Por defecto quedan
conectados y DISPONIBLES, esperando a que tú inicies cada carga: desde la app (QR /c/SIM01 o el
mapa /app) o desde la Consola OCPP (RemoteStartTransaction). Con -Auto cargan solos (llegan
vehículos al azar, cargan unos minutos y se van), útil para ver el Monitor con movimiento.

Uso (PowerShell, desde cualquier carpeta):
  $s = 'C:\Users\Administrador\electrolineras\scripts\windows\simular-cargadores.ps1'

  powershell -ExecutionPolicy Bypass -File $s -Registrar        # registra los que falten y arranca 10
  powershell -ExecutionPolicy Bypass -File $s                   # arranca 10 (ya registrados)
  powershell -ExecutionPolicy Bypass -File $s -Estado           # qué está corriendo y su última línea
  powershell -ExecutionPolicy Bypass -File $s -Detener          # detiene la flota

Opciones:
  -Cantidad 10          número de cargadores
  -Prefijo SIM          números de serie: SIM01, SIM02, …
  -Servidor URL         API (por defecto http://127.0.0.1:3000)
  -Ocpp 1.6|2.0.1|mixto versión del protocolo (mixto: los pares en 2.0.1)
  -Tarjeta AF22FF0B     tarjeta RFID de las cargas automáticas (autorizada en Configuración → RFID)
  -Auto                 cargas automáticas al azar (sin -Auto: solo cargan cuando tú los activas)
  -Ventanas             cada cargador en su propia ventana, con teclado (t, s, f, a, c, x, q)
  -Registrar            registra en el panel los cargadores que falten. Pide la clave del admin
                        (o -Correo/-Clave). Con -Empresa y -Electrolinera (por nombre) elige dónde;
                        si no, usa la primera empresa y su primera electrolinera. -Tarifa 1200.

Los procesos siguen corriendo aunque cierres la sesión de SSH; se detienen con -Detener.
Registros: simulador\flota\<serie>.log
#>
[CmdletBinding()]
param(
    [ValidateRange(1, 200)][int]$Cantidad = 10,
    [ValidatePattern('^[A-Za-z0-9._-]{1,40}$')][string]$Prefijo = 'SIM',
    [string]$Servidor = 'http://127.0.0.1:3000',
    [ValidateSet('1.6', '2.0.1', 'mixto')][string]$Ocpp = '1.6',
    [string]$Tarjeta = 'AF22FF0B',
    [switch]$Auto,
    [switch]$Manual,   # ya es el comportamiento por defecto; se acepta por compatibilidad
    [switch]$Ventanas,
    [switch]$Registrar,
    [string]$Correo = 'admin@electrolineras.local',
    [string]$Clave,
    [string]$Empresa,
    [string]$Electrolinera,
    [int]$Tarifa = 1200,
    [switch]$Estado,
    [switch]$Detener
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
# Windows PowerShell 5.1 busca un proxy (WPAD) antes de cada petición y puede quedarse colgado
# minutos en un servidor: las peticiones a la API van directas, sin proxy y con tiempo límite.
[System.Net.WebRequest]::DefaultWebProxy = $null
$espera = 15

$repo = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$carpetaSim = Join-Path $repo 'simulador'
$script = Join-Path $carpetaSim 'simulador-ocpp.js'
$carpetaFlota = Join-Path $carpetaSim 'flota'
$Servidor = $Servidor.TrimEnd('/')
$urlOcpp = ($Servidor -replace '^http', 'ws') + '/ocpp/ws'
$enWindows = [System.Environment]::OSVersion.Platform -eq 'Win32NT'
$series = 1..$Cantidad | ForEach-Object { '{0}{1:D2}' -f $Prefijo, $_ }

# Procesos node del simulador de esta flota (por la línea de comandos: script + serie con el prefijo).
function Get-ProcesosFlota {
    $patron = [regex]::Escape($Prefijo) + '\d+'
    if ($enWindows) {
        Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
            Where-Object { $_.CommandLine -like '*simulador-ocpp.js*' -and $_.CommandLine -match "\s$patron(\s|$)" } |
            ForEach-Object { [pscustomobject]@{ Id = $_.ProcessId; Serie = ([regex]::Match($_.CommandLine, "\s($patron)(\s|$)")).Groups[1].Value } }
    } else {
        Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*simulador-ocpp.js*' -and $_.CommandLine -match "\s$patron(\s|$)" } |
            ForEach-Object { [pscustomobject]@{ Id = $_.Id; Serie = ([regex]::Match($_.CommandLine, "\s($patron)(\s|$)")).Groups[1].Value } }
    }
}

function Get-UltimaLinea($serie) {
    $log = Join-Path $carpetaFlota "$serie.log"
    if (-not (Test-Path $log)) { return '' }
    # El último evento legible (no los mensajes OCPP crudos "→ …" / "← …"); si no hay, la última línea.
    $lineas = @(Get-Content $log -Tail 60 -Encoding UTF8 -ErrorAction SilentlyContinue)
    if (-not $lineas.Count) { return '' }
    $evento = $lineas | Where-Object { $_ -notmatch ' (→|←) ' } | Select-Object -Last 1
    if ($evento) { return [string]$evento } else { return [string]$lineas[-1] }
}

# ---------- -Detener ----------
if ($Detener) {
    $procesos = @(Get-ProcesosFlota)
    if (-not $procesos.Count) { Write-Host "No hay cargadores simulados '$Prefijo' corriendo."; exit 0 }
    # Apagado ordenado: cada simulador ve su archivo .detener, cierra la carga en curso
    # (StopTransaction) y sale; así no quedan sesiones abiertas en el servidor.
    Write-Host "==> Deteniendo $($procesos.Count) cargadores (cerrando sus cargas en curso)…"
    New-Item -ItemType Directory -Force -Path $carpetaFlota | Out-Null
    foreach ($p in $procesos) { Set-Content -Path (Join-Path $carpetaFlota "$($p.Serie).detener") -Value '' }
    $limite = (Get-Date).AddSeconds(20)
    while (@(Get-ProcesosFlota).Count -and (Get-Date) -lt $limite) { Start-Sleep -Seconds 1 }
    $quedan = @(Get-ProcesosFlota)
    foreach ($p in $quedan) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
    Remove-Item (Join-Path $carpetaFlota '*.detener') -ErrorAction SilentlyContinue
    Write-Host "Detenidos: $(($procesos.Serie | Sort-Object) -join ', ')"
    if ($quedan.Count) {
        Write-Warning "$($quedan.Count) no respondieron y se cerraron a la fuerza; si tenían una carga, cierra la sesión desde el panel."
    }
    exit 0
}

# ---------- -Estado ----------
if ($Estado) {
    $corriendo = @{}
    foreach ($p in @(Get-ProcesosFlota)) { $corriendo[$p.Serie] = $p.Id }
    $series | ForEach-Object {
        [pscustomobject]@{
            Serie         = $_
            Corriendo     = if ($corriendo.ContainsKey($_)) { "si (PID $($corriendo[$_]))" } else { 'no' }
            'Ultimo mensaje' = (Get-UltimaLinea $_)
        }
    } | Format-Table -AutoSize | Out-String -Width 250 | Write-Host  # ancho fijo: también sale bien por ssh -T
    exit 0
}

# ---------- Requisitos ----------
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw 'No se encontró Node.js (node). Instálalo o abre una consola nueva después de instalarlo.' }
if (-not (Test-Path (Join-Path $carpetaSim 'node_modules\ws'))) {
    Write-Host '==> Instalando dependencias del simulador (npm install)'
    Push-Location $carpetaSim
    try { npm install --no-audit --no-fund; if ($LASTEXITCODE -ne 0) { throw 'Falló npm install en simulador' } } finally { Pop-Location }
}
New-Item -ItemType Directory -Force -Path $carpetaFlota | Out-Null

$yaCorriendo = @(Get-ProcesosFlota)
if ($yaCorriendo.Count) {
    Write-Warning "Ya hay $($yaCorriendo.Count) cargadores '$Prefijo' corriendo. Usa -Detener primero (o -Estado para verlos)."
    exit 1
}

# ---------- ¿Están registrados? ----------
function Test-Registrado($serie) {
    try {
        Invoke-RestMethod -TimeoutSec $espera -Uri "$Servidor/cargadores/$serie" -Method Get | Out-Null
        return $true
    } catch {
        $codigo = $null
        if ($_.Exception.Response) { $codigo = [int]$_.Exception.Response.StatusCode }
        if ($codigo -eq 404) { return $false }
        throw "No se pudo consultar $Servidor ($($_.Exception.Message)). ¿Está corriendo el backend?"
    }
}

Write-Host "==> Revisando $Cantidad cargadores en $Servidor"
$faltan = @()
foreach ($serie in $series) {
    if (Test-Registrado $serie) { Write-Host "    $serie ya registrado" } else { Write-Host "    $serie falta"; $faltan += $serie }
}

if ($faltan.Count -and -not $Registrar) {
    Write-Warning "No están registrados: $($faltan -join ', ')"
    Write-Host 'Regístralos en el panel (Cargadores) o vuelve a correr el script con -Registrar.'
    exit 1
}

if ($faltan.Count) {
    if (-not $Clave) {
        # Por SSH el texto de Read-Host a veces no se ve: se escribe la pregunta aparte.
        Write-Host ''
        Write-Host "    Escribe la clave de $Correo y presiona Enter (no se ve mientras escribes)." -ForegroundColor Yellow
        Write-Host "    También puedes pasarla en el comando: -Clave 'tu-clave'" -ForegroundColor DarkGray
        $segura = Read-Host -AsSecureString
        $Clave = [System.Net.NetworkCredential]::new('', $segura).Password
    }
    Write-Host "==> Entrando como $Correo"
    try {
        $login = Invoke-RestMethod -TimeoutSec $espera -Uri "$Servidor/auth/login" -Method Post -ContentType 'application/json; charset=utf-8' `
            -Body ([System.Text.Encoding]::UTF8.GetBytes((@{ email = $Correo; password = $Clave } | ConvertTo-Json)))
    } catch {
        $codigo = $null
        if ($_.Exception.Response) { $codigo = [int]$_.Exception.Response.StatusCode }
        if ($codigo -eq 401) { throw "Clave incorrecta para $Correo (es la de ADMIN_PASSWORD en backend\.env)." }
        throw "No se pudo entrar: $($_.Exception.Message)"
    }
    $cabeceras = @{ Authorization = "Bearer $($login.token)" }

    Write-Host '==> Buscando empresa y electrolinera'
    $empresas = @(Invoke-RestMethod -TimeoutSec $espera -Uri "$Servidor/operadores" -Headers $cabeceras)
    if (-not $empresas.Count) { throw 'No hay empresas registradas: crea una en el panel (Empresas) primero.' }
    $emp = if ($Empresa) { $empresas | Where-Object { $_.nombre -like "*$Empresa*" } | Select-Object -First 1 } else { $empresas[0] }
    if (-not $emp) { throw "No se encontró la empresa '$Empresa'. Empresas: $(($empresas.nombre) -join ', ')" }

    $sitios = @(Invoke-RestMethod -TimeoutSec $espera -Uri "$Servidor/electrolineras" -Headers $cabeceras | Where-Object { $_.operador_id -eq $emp.id })
    $sitio = if ($Electrolinera) { $sitios | Where-Object { $_.nombre -like "*$Electrolinera*" } | Select-Object -First 1 } else { $sitios | Select-Object -First 1 }
    if ($Electrolinera -and -not $sitio) { throw "La empresa $($emp.nombre) no tiene la electrolinera '$Electrolinera'." }

    $destino = if ($sitio) { "$($emp.nombre) / $($sitio.nombre)" } else { "$($emp.nombre) (sin electrolinera)" }
    Write-Host "==> Registrando $($faltan.Count) cargadores en $destino"
    foreach ($serie in $faltan) {
        $n = [int]($serie.Substring($Prefijo.Length))
        $cuerpo = @{
            numero_serie     = $serie
            modelo           = 'MDXDC3001'
            operador_id      = $emp.id
            electrolinera_id = if ($sitio) { $sitio.id } else { $null }
            ubicacion        = "Simulado $n"
            tarifa_por_kwh   = $Tarifa
            version_ocpp     = 'auto'
            potencia_kw      = 30
        }
        try {
            Invoke-RestMethod -TimeoutSec $espera -Uri "$Servidor/cargadores" -Method Post -Headers $cabeceras -ContentType 'application/json; charset=utf-8' `
                -Body ([System.Text.Encoding]::UTF8.GetBytes(($cuerpo | ConvertTo-Json))) | Out-Null
            Write-Host "    $serie registrado"
        } catch {
            $detalle = $_.ErrorDetails.Message
            if ($detalle) { try { $detalle = ($detalle | ConvertFrom-Json).message } catch { } }
            throw "No se pudo registrar $serie : $(if ($detalle) { $detalle } else { $_.Exception.Message })"
        }
    }
}

# ---------- Arrancar ----------
Write-Host "==> Arrancando $Cantidad cargadores"
$vacio = Join-Path $carpetaFlota 'sin-teclado.txt'
Set-Content -Path $vacio -Value '' -NoNewline
Remove-Item (Join-Path $carpetaFlota '*.detener') -ErrorAction SilentlyContinue

$i = 0
foreach ($serie in $series) {
    $i++
    $version = switch ($Ocpp) { 'mixto' { if ($i % 2 -eq 0) { '2.0.1' } else { '1.6' } } default { $Ocpp } }
    $parar = Join-Path $carpetaFlota "$serie.detener"
    $argumentos = @("`"$script`"", $urlOcpp, $serie, '--ocpp', $version, '--intervalo', '5', '--parar-con', "`"$parar`"")
    if ($Auto) { $argumentos += @('--auto', $Tarjeta) }
    $lineaNode = "`"$node`" $($argumentos -join ' ')"
    $log = Join-Path $carpetaFlota "$serie.log"

    if ($Ventanas) {
        # Ventana propia con título y teclado (cerrar la ventana detiene ese cargador).
        Start-Process -FilePath 'cmd.exe' -ArgumentList "/k title $serie (OCPP $version) & $lineaNode" -WorkingDirectory $carpetaSim | Out-Null
    } elseif ($enWindows) {
        # Proceso independiente creado por WMI: sin ventana y sin depender de esta consola o de la
        # sesión SSH (sigue corriendo al cerrarla). La salida va al registro de cada cargador.
        $inicio = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [uint16]0 }
        $r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
            CommandLine               = "cmd.exe /d /s /c `"$lineaNode < `"$vacio`" > `"$log`" 2>&1`""
            CurrentDirectory          = [string]$carpetaSim
            ProcessStartupInformation = $inicio
        }
        if ($r.ReturnValue -ne 0) { throw "No se pudo arrancar $serie (Win32_Process.Create = $($r.ReturnValue))" }
    } else {
        # Linux/macOS (pruebas): el shell redirige, así el proceso no depende de esta consola.
        & /bin/sh -c "cd '$carpetaSim' && nohup $lineaNode < '$vacio' > '$log' 2>&1 &"
    }
    Write-Host ("    {0}  OCPP {1,-5}  {2}" -f $serie, $version, $(if ($Auto) { 'automático' } else { 'esperando que lo actives' }))
    Start-Sleep -Milliseconds 300
}

Start-Sleep -Seconds 4
$arriba = @(Get-ProcesosFlota).Count
Write-Host ''
Write-Host "==> $arriba de $Cantidad cargadores simulados corriendo contra $urlOcpp"
if (-not $Ventanas) {
    Write-Host "    Estado:   powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Estado"
    Write-Host "    Detener:  powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Detener"
    Write-Host "    Registros: $carpetaFlota"
}
if ($Auto) {
    Write-Host "    Las cargas empiezan solas en 5-40 s con la tarjeta $Tarjeta (debe estar en Configuración -> RFID)."
} else {
    # URL pública de la app (Configuración); si no está, la del panel en el puerto 3001.
    $panel = $null
    try { $panel = (Invoke-RestMethod -TimeoutSec $espera -Uri "$Servidor/configuracion/publica").url_publica_app } catch { }
    if (-not $panel) { $panel = 'http://<IP-del-servidor>:3001' }
    $panel = ([string]$panel).TrimEnd('/')
    Write-Host '    Los cargadores quedan disponibles. Para iniciar una carga en uno:'
    Write-Host "      - App:     $panel/c/$($series[0])  (o el mapa en $panel/app)"
    Write-Host '      - Consola: panel -> Consola OCPP -> elegir el cargador -> RemoteStartTransaction'
}
