#!/usr/bin/env bash
# Instala Electrolineras en Ubuntu 24.04 (contenedor LXC de Proxmox, VM o servidor) y lo deja
# corriendo con PM2 bajo systemd. Se ejecuta como root. Es idempotente: correrlo de nuevo
# actualiza el código y conserva la configuración (.env) y los datos (backend/data).
#
#   curl -fsSL https://raw.githubusercontent.com/infraestructura-it/electrolineras/main/scripts/linux/instalar.sh | bash
#
# Variables opcionales:
#   RAMA            main                     rama del repositorio
#   DIR             /opt/electrolineras      carpeta de la app
#   USUARIO         electro                  usuario de sistema que ejecuta la app
#   IP_PUBLICA      primera IP del equipo    IP o dominio con el que el navegador llega a la API
#   ADMIN_PASSWORD  aleatoria                clave del admin del panel (solo en la primera instalación)
#   ZT_RED          (vacío)                  ID de red ZeroTier a la que se une el equipo
#   FIREWALL        1                        0 para no tocar ufw
set -euo pipefail

REPO="https://github.com/infraestructura-it/electrolineras.git"
RAMA="${RAMA:-main}"
DIR="${DIR:-/opt/electrolineras}"
USUARIO="${USUARIO:-electro}"
NODE_MAYOR=24
IP_PUBLICA="${IP_PUBLICA:-$(hostname -I | awk '{print $1}')}"
ZT_RED="${ZT_RED:-}"
FIREWALL="${FIREWALL:-1}"
export DEBIAN_FRONTEND=noninteractive

azul() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
aviso() { printf '\033[1;33mAviso: %s\033[0m\n' "$*"; }
falla() { printf '\033[1;31mError: %s\033[0m\n' "$*" >&2; exit 1; }
como_app() { runuser -u "$USUARIO" -- "$@"; }
aleatoria() { head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | cut -c1-"$1"; }

[ "$(id -u)" -eq 0 ] || falla "Ejecuta este script como root."
[ -n "$IP_PUBLICA" ] || falla "No pude detectar la IP. Indícala con IP_PUBLICA=<ip o dominio>."

azul "Paquetes del sistema"
apt-get update -qq
apt-get install -y -qq ca-certificates curl git gnupg ufw >/dev/null
[ -f /usr/share/zoneinfo/America/Bogota ] && ln -sf /usr/share/zoneinfo/America/Bogota /etc/localtime

azul "Node.js $NODE_MAYOR"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" != "$NODE_MAYOR" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAYOR}.x" | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
echo "node $(node -v), npm $(npm -v)"
command -v pm2 >/dev/null || npm install -g pm2 --silent
# Versión leída del paquete: "pm2 -v" arrancaría un demonio de PM2 como root.
echo "pm2 $(node -p "require('$(npm root -g)/pm2/package.json').version")"

azul "Usuario de servicio '$USUARIO'"
id "$USUARIO" >/dev/null 2>&1 || useradd --system --create-home --home-dir "/home/$USUARIO" --shell /bin/bash "$USUARIO"

azul "Código en $DIR"
if [ -d "$DIR/.git" ]; then
  como_app git -C "$DIR" fetch --quiet origin "$RAMA"
  como_app git -C "$DIR" checkout --quiet "$RAMA"
  como_app git -C "$DIR" pull --quiet --ff-only origin "$RAMA"
else
  mkdir -p "$DIR"
  chown "$USUARIO:$USUARIO" "$DIR"
  como_app git clone --quiet --branch "$RAMA" "$REPO" "$DIR"
fi
echo "Commit $(como_app git -C "$DIR" log --oneline -1)"

azul "Configuración"
ADMIN_GENERADA=""
if [ ! -f "$DIR/backend/.env" ]; then
  if [ -z "${ADMIN_PASSWORD:-}" ]; then
    ADMIN_PASSWORD="$(aleatoria 14)"
    ADMIN_GENERADA=1
  fi
  [ "${#ADMIN_PASSWORD}" -ge 8 ] || falla "ADMIN_PASSWORD debe tener al menos 8 caracteres."
  cat > "$DIR/backend/.env" <<EOF
PORT=3000
ADMIN_EMAIL=admin@electrolineras.local
ADMIN_PASSWORD=$ADMIN_PASSWORD
EOF
  chown "$USUARIO:$USUARIO" "$DIR/backend/.env"
  chmod 600 "$DIR/backend/.env"
  echo "Creado backend/.env"
else
  echo "backend/.env ya existe: se conserva."
fi
if [ ! -f "$DIR/frontend/.env.local" ]; then
  echo "NEXT_PUBLIC_API_URL=http://$IP_PUBLICA:3000" > "$DIR/frontend/.env.local"
  chown "$USUARIO:$USUARIO" "$DIR/frontend/.env.local"
  echo "Creado frontend/.env.local con http://$IP_PUBLICA:3000"
else
  echo "frontend/.env.local ya existe: se conserva ($(cat "$DIR/frontend/.env.local"))."
fi

azul "Compilando backend y frontend"
como_app bash -c "cd '$DIR/backend' && npm ci --no-audit --no-fund --loglevel=error && npm run build --silent"
como_app bash -c "cd '$DIR/frontend' && npm ci --no-audit --no-fund --loglevel=error && npm run build --silent"

azul "Procesos con PM2"
como_app bash -c "cd '$DIR' && pm2 startOrReload ecosystem.config.js --update-env >/dev/null && pm2 save >/dev/null && pm2 list"
if [ -d /run/systemd/system ]; then
  # Crea y habilita pm2-<usuario>.service: la app arranca sola con el contenedor.
  pm2 startup systemd -u "$USUARIO" --hp "/home/$USUARIO" >/dev/null
  systemctl enable --quiet "pm2-$USUARIO"
  echo "Servicio pm2-$USUARIO habilitado al arranque."
else
  aviso "Este sistema no usa systemd: la app no arrancará sola tras reiniciar."
fi

if [ "$FIREWALL" = "1" ]; then
  azul "Firewall (ufw)"
  if ufw allow 22/tcp >/dev/null && ufw allow 3000/tcp >/dev/null && ufw allow 3001/tcp >/dev/null && ufw --force enable >/dev/null; then
    echo "Abiertos: 22 (SSH), 3000 (API y OCPP), 3001 (panel)."
  else
    aviso "No se pudo activar ufw (algunos contenedores no lo permiten). Usa el firewall de Proxmox si lo necesitas."
  fi
fi

if [ -n "$ZT_RED" ]; then
  azul "ZeroTier"
  if [ -c /dev/net/tun ]; then
    command -v zerotier-cli >/dev/null || curl -fsSL https://install.zerotier.com | bash >/dev/null
    systemctl enable --now --quiet zerotier-one 2>/dev/null || true
    sleep 3
    zerotier-cli join "$ZT_RED"
    echo "Autoriza este equipo en my.zerotier.com (red $ZT_RED)."
  else
    aviso "No existe /dev/net/tun: crea el contenedor con ZT_RED (crear-lxc.sh) o habilita TUN en su configuración."
  fi
fi

azul "Verificación"
for _ in $(seq 1 20); do
  curl -fs -o /dev/null "http://127.0.0.1:3000/configuracion/publica" && break
  sleep 2
done
if curl -fs -o /dev/null "http://127.0.0.1:3000/configuracion/publica"; then echo "API respondiendo en el puerto 3000."; else aviso "La API no responde todavía. Revisa: runuser -u $USUARIO -- pm2 logs electrolineras"; fi
if curl -fs -o /dev/null "http://127.0.0.1:3001/login"; then echo "Panel respondiendo en el puerto 3001."; else aviso "El panel no responde todavía. Revisa: runuser -u $USUARIO -- pm2 logs electrolineras-front"; fi

cat <<EOF

Electrolineras instalado.
  Panel:          http://$IP_PUBLICA:3001
  API:            http://$IP_PUBLICA:3000
  Gateway OCPP:   ws://$IP_PUBLICA:3000/ocpp
EOF
[ -n "$ADMIN_GENERADA" ] && printf '  Admin:          admin@electrolineras.local / %s  (guárdala: no se vuelve a mostrar)\n' "$ADMIN_PASSWORD"
cat <<EOF
  Logs:           runuser -u $USUARIO -- pm2 logs
  Actualizar:     $DIR/scripts/linux/actualizar.sh
EOF
