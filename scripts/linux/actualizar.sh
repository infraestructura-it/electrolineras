#!/usr/bin/env bash
# Actualiza Electrolineras en Linux: trae los cambios, compila y recarga PM2 sin cortar el servicio.
# Conserva backend/.env, frontend/.env.local y backend/data. Se ejecuta como root:
#
#   /opt/electrolineras/scripts/linux/actualizar.sh
#   pct exec <CTID> -- /opt/electrolineras/scripts/linux/actualizar.sh   (desde el host Proxmox)
set -euo pipefail

DIR="${DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
USUARIO="${USUARIO:-$(stat -c '%U' "$DIR")}"
RAMA="${RAMA:-main}"
como_app() { runuser -u "$USUARIO" -- "$@"; }

[ "$(id -u)" -eq 0 ] || { echo "Ejecuta este script como root." >&2; exit 1; }
[ "$USUARIO" != "root" ] || { echo "La carpeta $DIR pertenece a root: este script es para una instalación hecha con instalar.sh." >&2; exit 1; }

echo "==> git pull ($RAMA)"
como_app git -C "$DIR" pull --ff-only origin "$RAMA"
como_app git -C "$DIR" log --oneline -1

echo "==> Backend"
como_app bash -c "cd '$DIR/backend' && npm ci --no-audit --no-fund --loglevel=error && npm run build --silent"

echo "==> Frontend"
como_app bash -c "cd '$DIR/frontend' && npm ci --no-audit --no-fund --loglevel=error && npm run build --silent"

echo "==> PM2"
como_app bash -c "cd '$DIR' && pm2 startOrReload ecosystem.config.js --update-env && pm2 save && pm2 list"
