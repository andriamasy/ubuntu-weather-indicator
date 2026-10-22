#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== Syntaxe =="
while IFS= read -r -d '' file; do
    node --check "$file"
done < <(find extension tests -name '*.js' -print0)

echo "== Tests Node =="
node --test tests/weather.test.mjs tests/i18n.test.mjs

echo "== Modules GJS =="
gjs -m tests/gjs-smoke.js

echo "== Détection =="
"$ROOT/bin/ubuntu-weather-indicator" check
if UWI_GNOME_SHELL_VERSION=46 "$ROOT/bin/ubuntu-weather-indicator" check; then
    echo "GNOME 46 aurait dû être refusé." >&2
    exit 1
fi
if UWI_OS_ID=debian UWI_OS_VERSION=13 UWI_GNOME_SHELL_VERSION=50.1 \
    "$ROOT/bin/ubuntu-weather-indicator" check; then
    echo "Une distribution non testée aurait dû être refusée." >&2
    exit 1
fi
echo "Tests automatiques réussis."
