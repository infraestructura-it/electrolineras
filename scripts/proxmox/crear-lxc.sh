#!/usr/bin/env bash
# Crea un contenedor LXC Ubuntu 24.04 en Proxmox VE y deja Electrolineras instalado y corriendo.
#
# Se ejecuta en la shell del HOST Proxmox (como root), no dentro de una VM:
#
#   bash <(curl -fsSL https://raw.githubusercontent.com/infraestructura-it/electrolineras/main/scripts/proxmox/crear-lxc.sh)
#
# Todo es configurable con variables antes del comando, por ejemplo IP fija y ZeroTier:
#
#   IP=192.168.2.50/24 GW=192.168.2.1 ZT_RED=<id-de-red> \
#     bash <(curl -fsSL https://raw.githubusercontent.com/infraestructura-it/electrolineras/main/scripts/proxmox/crear-lxc.sh)
#
# Variables (con su valor por defecto):
#   CTID          siguiente ID libre       ID del contenedor
#   NOMBRE        electrolineras           hostname
#   IP            dhcp                     "dhcp" o IP/máscara, ej. 192.168.2.50/24
#   GW            (vacío)                  puerta de enlace, obligatoria con IP fija
#   PUENTE        vmbr0                    bridge de red de Proxmox
#   ALMACEN       local-lvm o local        almacenamiento del disco del contenedor
#   ALMACEN_PLANTILLA local                almacenamiento de plantillas (vztmpl)
#   DISCO         16                       GB
#   RAM           2048                     MB (Next.js necesita ~1.5 GB para compilar)
#   SWAP          1024                     MB
#   CPUS          2
#   CLAVE_ROOT    aleatoria                clave de root del contenedor (se muestra al final)
#   ZT_RED        (vacío)                  ID de red ZeroTier: habilita /dev/net/tun y se une
#   ADMIN_PASSWORD aleatoria               clave del admin del panel (se muestra al final)
#   RAMA          main                     rama del repositorio
set -euo pipefail

REPO_RAW="https://raw.githubusercontent.com/infraestructura-it/electrolineras"

azul() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
aviso() { printf '\033[1;33mAviso: %s\033[0m\n' "$*"; }
falla() { printf '\033[1;31mError: %s\033[0m\n' "$*" >&2; exit 1; }
aleatoria() { head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | cut -c1-"$1"; }

[ "$(id -u)" -eq 0 ] || falla "Ejecuta este script como root en el host Proxmox."
command -v pct >/dev/null || falla "No encuentro 'pct'. Este script va en la shell del host Proxmox, no dentro de una VM."

CTID="${CTID:-$(pvesh get /cluster/nextid)}"
NOMBRE="${NOMBRE:-electrolineras}"
IP="${IP:-dhcp}"
GW="${GW:-}"
PUENTE="${PUENTE:-vmbr0}"
ALMACEN_PLANTILLA="${ALMACEN_PLANTILLA:-local}"
DISCO="${DISCO:-16}"
RAM="${RAM:-2048}"
SWAP="${SWAP:-1024}"
CPUS="${CPUS:-2}"
CLAVE_ROOT="${CLAVE_ROOT:-$(aleatoria 16)}"
ZT_RED="${ZT_RED:-}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(aleatoria 14)}"
RAMA="${RAMA:-main}"

if [ -z "${ALMACEN:-}" ]; then
  if pvesm status --content rootdir 2>/dev/null | awk 'NR>1 {print $1}' | grep -qx 'local-lvm'; then
    ALMACEN=local-lvm
  else
    ALMACEN=$(pvesm status --content rootdir | awk 'NR>1 && $3=="active" {print $1; exit}')
  fi
fi
[ -n "$ALMACEN" ] || falla "No encontré un almacenamiento para discos de contenedor. Indícalo con ALMACEN=<nombre>."
pct status "$CTID" >/dev/null 2>&1 && falla "Ya existe un contenedor con ID $CTID. Usa otro con CTID=<id>."
if [ "$IP" != "dhcp" ]; then
  [[ "$IP" == */* ]] || falla "La IP fija debe llevar máscara, ej. IP=192.168.2.50/24"
  [ -n "$GW" ] || falla "Con IP fija indica la puerta de enlace, ej. GW=192.168.2.1"
fi
if [[ ! "$ZT_RED" =~ ^([0-9a-fA-F]{16})?$ ]]; then falla "ZT_RED debe ser el ID de red de ZeroTier (16 caracteres hexadecimales)."; fi

azul "Plantilla Ubuntu 24.04"
pveam update >/dev/null
PLANTILLA=$(pveam available --section system | awk '/ubuntu-24\.04-standard/ {print $2}' | sort -V | tail -n1)
[ -n "$PLANTILLA" ] || falla "No encontré la plantilla ubuntu-24.04-standard en 'pveam available'."
if ! pveam list "$ALMACEN_PLANTILLA" | grep -q "$PLANTILLA"; then
  pveam download "$ALMACEN_PLANTILLA" "$PLANTILLA"
fi
echo "Usando $PLANTILLA"

azul "Creando el contenedor $CTID ($NOMBRE)"
RED="name=eth0,bridge=$PUENTE,ip=$IP"
[ "$IP" != "dhcp" ] && RED="$RED,gw=$GW"
pct create "$CTID" "$ALMACEN_PLANTILLA:vztmpl/$PLANTILLA" \
  --hostname "$NOMBRE" \
  --description "Electrolineras: API NestJS (3000, OCPP en /ocpp) y panel Next.js (3001)" \
  --ostype ubuntu \
  --unprivileged 1 \
  --features nesting=1 \
  --cores "$CPUS" \
  --memory "$RAM" \
  --swap "$SWAP" \
  --rootfs "$ALMACEN:$DISCO" \
  --net0 "$RED" \
  --nameserver "1.1.1.1 8.8.8.8" \
  --timezone America/Bogota \
  --onboot 1 \
  --password "$CLAVE_ROOT"

if [ -n "$ZT_RED" ]; then
  # ZeroTier necesita el dispositivo TUN, que un contenedor sin privilegios no tiene por defecto.
  cat >> "/etc/pve/lxc/$CTID.conf" <<'EOF'
lxc.cgroup2.devices.allow: c 10:200 rwm
lxc.mount.entry: /dev/net dev/net none bind,create=dir
EOF
  echo "Dispositivo TUN habilitado para ZeroTier."
fi

azul "Arrancando"
pct start "$CTID"
for _ in $(seq 1 30); do
  if pct exec "$CTID" -- getent hosts github.com >/dev/null 2>&1; then break; fi
  sleep 2
done
pct exec "$CTID" -- getent hosts github.com >/dev/null 2>&1 || falla "El contenedor no tiene salida a internet. Revisa la red ($RED) y vuelve a intentar."

azul "Instalando Electrolineras dentro del contenedor (5 a 10 minutos)"
TMP=$(mktemp)
curl -fsSL "$REPO_RAW/$RAMA/scripts/linux/instalar.sh" -o "$TMP"
pct push "$CTID" "$TMP" /root/instalar.sh --perms 0755
rm -f "$TMP"
pct exec "$CTID" -- env RAMA="$RAMA" ADMIN_PASSWORD="$ADMIN_PASSWORD" ZT_RED="$ZT_RED" bash /root/instalar.sh

IP_CT=$(pct exec "$CTID" -- hostname -I | awk '{print $1}')
azul "Listo"
cat <<EOF
Contenedor ............ $CTID ($NOMBRE), IP $IP_CT
Clave de root ......... $CLAVE_ROOT
Panel ................. http://$IP_CT:3001
Usuario del panel ..... admin@electrolineras.local
Clave del panel ....... $ADMIN_PASSWORD
Gateway OCPP .......... ws://$IP_CT:3000/ocpp   (domain_master del cargador)

Guarda estas claves ahora: no se vuelven a mostrar.
Entrar al contenedor:   pct enter $CTID
Actualizar la app:      pct exec $CTID -- /opt/electrolineras/scripts/linux/actualizar.sh
EOF
[ "$IP" = "dhcp" ] && aviso "La IP llegó por DHCP. Resérvala en el router o recrea con IP fija: el QR de los cargadores y el domain_master dependen de ella."
exit 0
