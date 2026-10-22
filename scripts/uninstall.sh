#!/bin/bash
set -euo pipefail
UUID="ubuntu-weather-indicator@lunix"
if [[ "$(id -u)" -eq 0 ]]; then
    echo "Désactivez d'abord l'extension depuis votre session, puis relancez ce script." >&2
    exit 1
fi
if command -v gnome-extensions >/dev/null 2>&1; then
    gnome-extensions disable "$UUID" || true
fi
echo "Les réglages dconf et le cache personnel sont conservés."
echo "Pour les effacer vous-même :"
echo "  dconf reset -f /org/gnome/shell/extensions/ubuntu-weather-indicator/"
echo "  rm -rf \"\${XDG_CACHE_HOME:-\$HOME/.cache}/ubuntu-weather-indicator\""
exec sudo apt remove ubuntu-weather-indicator
