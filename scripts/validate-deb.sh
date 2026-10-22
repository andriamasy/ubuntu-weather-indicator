#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(tr -d '[:space:]' < "$ROOT/VERSION")"
DEB="$ROOT/dist/ubuntu-weather-indicator_${VERSION}_all.deb"
WORK="$ROOT/build/validate"

if [[ ! -f "$DEB" ]]; then
    echo "Paquet introuvable : $DEB" >&2
    exit 1
fi

rm -rf "$WORK"
mkdir -p "$WORK"
dpkg-deb --info "$DEB" > "$WORK/info.txt"
dpkg-deb --contents "$DEB" > "$WORK/contents.txt"

grep -q "Architecture: all" "$WORK/info.txt"
grep -q "Version: ${VERSION}" "$WORK/info.txt"
grep -q "gnome-shell (>= 50~)" "$WORK/info.txt"
grep -q "gnome-shell (<< 51~)" "$WORK/info.txt"

if grep -E 'gschemas.compiled|/\.env|id_rsa|api[_-]?key' "$WORK/contents.txt"; then
    echo "Le paquet contient un fichier qui ne doit pas être distribué." >&2
    exit 1
fi

for path in \
    ./usr/bin/ubuntu-weather-indicator \
    ./usr/share/gnome-shell/extensions/ubuntu-weather-indicator@lunix/extension.js \
    ./usr/share/gnome-shell/extensions/ubuntu-weather-indicator@lunix/prefs.js \
    ./usr/share/gnome-shell/extensions/ubuntu-weather-indicator@lunix/schemas/org.gnome.shell.extensions.ubuntu-weather-indicator.gschema.xml \
    ./usr/share/glib-2.0/schemas/org.gnome.shell.extensions.ubuntu-weather-indicator.gschema.xml \
    ./usr/share/locale/fr/LC_MESSAGES/ubuntu-weather-indicator.mo \
    ./usr/share/locale/en/LC_MESSAGES/ubuntu-weather-indicator.mo \
    ./usr/share/applications/ubuntu-weather-indicator.desktop \
    ./usr/share/doc/ubuntu-weather-indicator/copyright
 do
    if ! grep -q "$path" "$WORK/contents.txt"; then
        echo "Fichier manquant dans le paquet : $path" >&2
        exit 1
    fi
done

dpkg-deb -e "$DEB" "$WORK/DEBIAN"
if grep -R -n -E 'curl |wget |ssh |dconf reset|rm -rf /home|rm -rf \$HOME|rm -rf ~' "$WORK/DEBIAN"; then
    echo "Script de maintenance dangereux." >&2
    exit 1
fi
if ! grep -q "ubuntu-weather-indicator check" "$WORK/DEBIAN/postinst"; then
    echo "postinst ne vérifie pas l'environnement." >&2
    exit 1
fi
if grep -q "gnome-extensions enable" "$WORK/DEBIAN/postinst"; then
    echo "postinst ne doit pas activer l'extension en root." >&2
    exit 1
fi

if command -v lintian >/dev/null 2>&1; then
    lintian --no-tag-display-limit --suppress-tags dir-or-file-in-var-www \
        "$DEB" > "$WORK/lintian.txt" || true
    if grep -E '^E:' "$WORK/lintian.txt"; then
        echo "lintian a signalé des erreurs." >&2
        exit 1
    fi
fi

if command -v desktop-file-validate >/dev/null 2>&1; then
    desktop-file-validate "$ROOT/data/ubuntu-weather-indicator.desktop"
fi

echo "Paquet valide : $DEB"
