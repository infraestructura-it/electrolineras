#!/usr/bin/env bash
# Copia los datos de una instalación anterior (carpeta backend/data con los .json) al
# contenedor LXC y reinicia la app. Se ejecuta en el HOST Proxmox como root:
#
#   bash migrar-datos.sh <CTID> <carpeta-con-los-json>
#   bash migrar-datos.sh 120 /root/electrolineras-data
#
# Los datos actuales del contenedor se respaldan antes en backend/data.respaldo-<fecha>.
set -euo pipefail

CTID="${1:-}"
ORIGEN="${2:-}"
DESTINO="${DIR:-/opt/electrolineras}/backend/data"
USUARIO=electro

[ "$(id -u)" -eq 0 ] || { echo "Ejecuta como root en el host Proxmox." >&2; exit 1; }
[ -n "$CTID" ] && [ -d "$ORIGEN" ] || { echo "Uso: bash migrar-datos.sh <CTID> <carpeta-con-los-json>" >&2; exit 1; }
compgen -G "$ORIGEN/*.json" >/dev/null || { echo "No hay archivos .json en $ORIGEN" >&2; exit 1; }

echo "==> Deteniendo la app en el contenedor $CTID"
pct exec "$CTID" -- runuser -u "$USUARIO" -- pm2 stop all >/dev/null

FECHA=$(date +%Y%m%d-%H%M%S)
echo "==> Respaldo de los datos actuales en $DESTINO.respaldo-$FECHA"
pct exec "$CTID" -- bash -c "[ -d '$DESTINO' ] && cp -a '$DESTINO' '$DESTINO.respaldo-$FECHA' || true; mkdir -p '$DESTINO'"

echo "==> Copiando"
for archivo in "$ORIGEN"/*.json; do
  pct push "$CTID" "$archivo" "$DESTINO/$(basename "$archivo")"
  echo "  $(basename "$archivo")"
done
pct exec "$CTID" -- chown -R "$USUARIO:$USUARIO" "$DESTINO"
pct exec "$CTID" -- chmod 600 "$DESTINO/secreto.json" 2>/dev/null || true

echo "==> Arrancando la app"
pct exec "$CTID" -- runuser -u "$USUARIO" -- pm2 restart all --update-env >/dev/null
pct exec "$CTID" -- runuser -u "$USUARIO" -- pm2 list
echo "Listo. La clave del admin del panel es la de backend/.env del contenedor (ADMIN_PASSWORD)."
