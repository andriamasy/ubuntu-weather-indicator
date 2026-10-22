#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
"$ROOT/scripts/package-deb.sh"
VERSION="$(tr -d '[:space:]' < "$ROOT/VERSION")"
DEB="$ROOT/dist/ubuntu-weather-indicator_${VERSION}_all.deb"
"$ROOT/bin/ubuntu-weather-indicator" check
echo "Le paquet est prêt : $DEB"
echo "Installez-le avec : sudo apt install ./$DEB"
exec sudo apt install "$DEB"
