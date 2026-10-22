#!/bin/bash
# Lance un GNOME Shell 50 isolé, avec un moniteur virtuel, et vérifie que
# l'indicateur empaqueté est sur la même ligne que l'horloge.
# La session déjà ouverte ne recharge pas les extensions ajoutées après
# son démarrage ; ce script ne modifie donc pas ses réglages.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UUID="ubuntu-weather-indicator@lunix"
PACKED="$ROOT/build/root/usr/share/gnome-shell/extensions/${UUID}"
BASE="${TMPDIR:-/tmp}/uwi-session-test"
SCHEMA="org.gnome.shell.extensions.ubuntu-weather-indicator"

if [[ ! -d "$PACKED" ]]; then
    echo "Construisez d'abord le paquet : scripts/package-deb.sh" >&2
    exit 1
fi

rm -rf "$BASE"
mkdir -p "$BASE/data/gnome-shell/extensions" "$BASE/config" "$BASE/cache" "$BASE/out"
cp -a "$PACKED" "$BASE/data/gnome-shell/extensions/$UUID"
glib-compile-schemas "$BASE/data/gnome-shell/extensions/$UUID/schemas"

export XDG_DATA_HOME="$BASE/data"
export XDG_CONFIG_HOME="$BASE/config"
export XDG_CACHE_HOME="$BASE/cache"

dbus-run-session -- bash -c '
set -euo pipefail
gnome-shell --headless --virtual-monitor 1280x800 --wayland --no-x11 > "'"$BASE"'/shell.log" 2>&1 &
echo $! > "'"$BASE"'/shell.pid"
cleanup() { kill "$(cat "'"$BASE"'/shell.pid")" 2>/dev/null || true; }
trap cleanup EXIT
for _ in $(seq 1 40); do
    if gnome-extensions info "'"$UUID"'" 2>/dev/null | grep -q ACTIVE; then
        break
    fi
    gnome-extensions enable "'"$UUID"'" >/dev/null 2>&1 || true
    sleep 0.4
done
SCHEMA_DIR="'"$BASE"'/data/gnome-shell/extensions/'"$UUID"'/schemas"
gsettings --schemadir "$SCHEMA_DIR" set "'"$SCHEMA"'" city-name "Paris"
gsettings --schemadir "$SCHEMA_DIR" set "'"$SCHEMA"'" country-name "France"
gsettings --schemadir "$SCHEMA_DIR" set "'"$SCHEMA"'" latitude 48.8566
gsettings --schemadir "$SCHEMA_DIR" set "'"$SCHEMA"'" longitude 2.3522
gsettings --schemadir "$SCHEMA_DIR" set "'"$SCHEMA"'" manual-ready true
sleep 3
python3 "'"$ROOT"'/scripts/check-panel.py" "'"$BASE"'/panel.json" | tee "'"$BASE"'/panel.log"
grep -q "beside the clock" "'"$BASE"'/shell.log"
grep -q "Weather status: live" "'"$BASE"'/shell.log"
'

unset XDG_DATA_HOME XDG_CONFIG_HOME XDG_CACHE_HOME
echo "Journal : $BASE/shell.log"
