# Actualiza Electrolineras en Windows Server: trae cambios, instala, compila y reinicia PM2.
# Uso (PowerShell, desde cualquier carpeta):
#   powershell -ExecutionPolicy Bypass -File C:\Users\Administrador\electrolineras\scripts\windows\actualizar.ps1

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$env:PM2_HOME = 'C:\pm2'

# PowerShell 5.1 no se detiene cuando un comando externo (git, npm) falla: se revisa el código de salida.
function Exigir($paso) {
    if ($LASTEXITCODE -ne 0) { throw "Falló: $paso (código $LASTEXITCODE). No se reinicia PM2." }
}

$repo = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $repo

Write-Host '==> git pull'
git pull
Exigir 'git pull'

Write-Host '==> Backend: npm install + build'
Set-Location (Join-Path $repo 'backend')
npm install; Exigir 'npm install (backend)'
npm run build; Exigir 'build del backend'

Write-Host '==> Frontend: npm install + build'
Set-Location (Join-Path $repo 'frontend')
if (-not (Test-Path '.env.local')) {
    Write-Warning 'Falta frontend\.env.local (copia .env.local.example y ajusta NEXT_PUBLIC_API_URL). Se compila con el valor por defecto.'
}
npm install; Exigir 'npm install (frontend)'
npm run build; Exigir 'build del frontend'

Write-Host '==> PM2'
Set-Location $repo
# startOrReload arranca los procesos que falten y reinicia los que ya existen.
# (Antes se leía "pm2 jlist" con ConvertFrom-Json, que falla en Windows porque el entorno
# trae claves repetidas como USERNAME/username.)
pm2 startOrReload ecosystem.config.js --update-env
pm2 save
pm2 list
