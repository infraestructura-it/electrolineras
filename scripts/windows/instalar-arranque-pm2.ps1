# Crea la tarea programada que restaura los procesos de PM2 al encender Windows.
# PM2 no soporta "pm2 startup" en Windows, por eso se usa el Programador de tareas.
# Ejecutar UNA vez, en PowerShell como administrador, después de "pm2 save":
#   powershell -ExecutionPolicy Bypass -File .\scripts\windows\instalar-arranque-pm2.ps1

$ErrorActionPreference = 'Stop'

# PM2_HOME fijo y a nivel de máquina, para que SYSTEM y el usuario compartan el mismo dump.pm2
[Environment]::SetEnvironmentVariable('PM2_HOME', 'C:\pm2', 'Machine')
$env:PM2_HOME = 'C:\pm2'

$pm2 = Join-Path $env:APPDATA 'npm\pm2.cmd'
if (-not (Test-Path $pm2)) {
    throw "No se encontró $pm2. Instala PM2 con: npm install -g pm2"
}

$nombre = 'PM2 Electrolineras'
$accion = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c set PM2_HOME=C:\pm2&& `"$pm2`" resurrect"
$disparador = New-ScheduledTaskTrigger -AtStartup

if (Get-ScheduledTask -TaskName $nombre -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $nombre -Confirm:$false
}
Register-ScheduledTask -TaskName $nombre -Action $accion -Trigger $disparador -User 'SYSTEM' -RunLevel Highest | Out-Null

Write-Host "Tarea '$nombre' creada. Reinicia la máquina y verifica con: pm2 list"
