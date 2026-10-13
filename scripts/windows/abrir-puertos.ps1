# Abre en el firewall de Windows los puertos del backend (3000) y frontend (3001).
# Ejecutar una vez, en PowerShell como administrador.

$reglas = @(
    @{ Nombre = 'Electrolineras Backend 3000'; Puerto = 3000 },
    @{ Nombre = 'Electrolineras Front 3001';   Puerto = 3001 }
)

foreach ($r in $reglas) {
    if (-not (Get-NetFirewallRule -DisplayName $r.Nombre -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -DisplayName $r.Nombre -Direction Inbound -Protocol TCP `
            -LocalPort $r.Puerto -Action Allow -Profile Any | Out-Null
        Write-Host "Regla creada: $($r.Nombre)"
    } else {
        Write-Host "Ya existe: $($r.Nombre)"
    }
}
