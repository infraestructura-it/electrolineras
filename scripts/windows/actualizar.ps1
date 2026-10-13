# Actualiza Electrolineras en Windows Server: trae cambios, instala, compila y reinicia PM2.
# Uso (PowerShell, desde cualquier carpeta):
#   powershell -ExecutionPolicy Bypass -File C:\Users\Administrador\electrolineras\scripts\windows\actualizar.ps1

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$env:PM2_HOME = 'C:\pm2'

$repo = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $repo

Write-Host '==> git pull'
git pull

Write-Host '==> Backend: npm install + build'
Set-Location (Join-Path $repo 'backend')
npm install
npm run build

Write-Host '==> Frontend: npm install + build'
Set-Location (Join-Path $repo 'frontend')
if (-not (Test-Path '.env.local')) {
    Write-Warning 'Falta frontend\.env.local (copia .env.local.example y ajusta NEXT_PUBLIC_API_URL). Se compila con el valor por defecto.'
}
npm install
npm run build

Write-Host '==> PM2'
Set-Location $repo
$enPm2 = pm2 jlist | ConvertFrom-Json
if ($enPm2 | Where-Object { $_.name -like 'electrolineras*' }) {
    pm2 restart ecosystem.config.js --update-env
} else {
    pm2 start ecosystem.config.js
}
pm2 save
pm2 list
