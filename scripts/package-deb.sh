#!/bin/bash
set -euo pipefail
umask 022

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(tr -d '[:space:]' < "$ROOT/VERSION")"
NAME="ubuntu-weather-indicator"
UUID="ubuntu-weather-indicator@lunix"
ARCH="all"
STAGE="$ROOT/build/root"
DEBIAN="$STAGE/DEBIAN"
EXT="$STAGE/usr/share/gnome-shell/extensions/${UUID}"
DOC="$STAGE/usr/share/doc/${NAME}"

rm -rf "$ROOT/build/root"
mkdir -p \
    "$EXT/schemas" \
    "$STAGE/usr/share/glib-2.0/schemas" \
    "$STAGE/usr/share/applications" \
    "$STAGE/usr/share/metainfo" \
    "$STAGE/usr/share/icons/hicolor/scalable/apps" \
    "$STAGE/usr/share/man/man1" \
    "$DOC" \
    "$STAGE/usr/bin" \
    "$DEBIAN" \
    "$ROOT/dist"

cp "$ROOT/extension/"*.js "$ROOT/extension/"*.css "$ROOT/extension/metadata.json" "$EXT/"
cp -a "$ROOT/extension/lib" "$EXT/lib"
cp "$ROOT/extension/schemas/"*.xml "$EXT/schemas/"
cp "$ROOT/extension/schemas/"*.xml "$STAGE/usr/share/glib-2.0/schemas/"

for lang in fr en; do
    mkdir -p "$EXT/locale/${lang}/LC_MESSAGES" \
        "$STAGE/usr/share/locale/${lang}/LC_MESSAGES"
    msgfmt -o "$EXT/locale/${lang}/LC_MESSAGES/${NAME}.mo" "$ROOT/po/${lang}.po"
    cp "$EXT/locale/${lang}/LC_MESSAGES/${NAME}.mo" \
        "$STAGE/usr/share/locale/${lang}/LC_MESSAGES/${NAME}.mo"
done

install -m 0755 "$ROOT/bin/ubuntu-weather-indicator" "$STAGE/usr/bin/ubuntu-weather-indicator"
install -m 0644 "$ROOT/data/ubuntu-weather-indicator.desktop" "$STAGE/usr/share/applications/"
install -m 0644 "$ROOT/data/ubuntu-weather-indicator.metainfo.xml" "$STAGE/usr/share/metainfo/"
install -m 0644 "$ROOT/data/ubuntu-weather-indicator.svg" \
    "$STAGE/usr/share/icons/hicolor/scalable/apps/ubuntu-weather-indicator.svg"
gzip -9 -n -c "$ROOT/data/ubuntu-weather-indicator.1" > "$STAGE/usr/share/man/man1/ubuntu-weather-indicator.1.gz"
install -m 0644 "$ROOT/README.md" "$DOC/README.md"
install -m 0644 "$ROOT/docs/fournisseurs.md" "$DOC/fournisseurs.md"
install -m 0644 "$ROOT/docs/depannage.md" "$DOC/depannage.md"
install -m 0644 "$ROOT/packaging/copyright" "$DOC/copyright"
gzip -9 -n -c "$ROOT/CHANGELOG.md" > "$DOC/changelog.gz"

cat > "$DOC/changelog.Debian" <<EOF
${NAME} (${VERSION}) resolute; urgency=medium

  * Le préavis additionne les heures et les minutes saisies ensemble.

 -- mathieu <mathieu@localhost>  Fri, 23 Oct 2026 12:10:00 +0300
EOF
gzip -9 -n -f "$DOC/changelog.Debian"

mkdir -p "$STAGE/usr/share/lintian/overrides"
cat > "$STAGE/usr/share/lintian/overrides/${NAME}" <<'EOF'
# Paquet local : pas d'adresse publique du mainteneur.
bogus-mail-host
bogus-mail-host-in-debian-changelog
# La page de manuel est courte : gzip ne la réduit pas assez pour lintian.
poor-compression-in-manual-page
EOF

find "$STAGE" -type d -exec chmod 0755 {} +
find "$STAGE" -type f -exec chmod 0644 {} +
chmod 0755 "$STAGE/usr/bin/ubuntu-weather-indicator"

install -m 0755 "$ROOT/packaging/postinst" "$DEBIAN/postinst"
install -m 0755 "$ROOT/packaging/postrm" "$DEBIAN/postrm"

SIZE_KB="$(du -sk "$STAGE/usr" | awk '{print $1}')"
cat > "$DEBIAN/control" <<EOF
Package: ${NAME}
Version: ${VERSION}
Section: gnome
Priority: optional
Architecture: ${ARCH}
Installed-Size: ${SIZE_KB}
Depends: gnome-shell (>= 50~), gnome-shell (<< 51~), gjs (>= 1.78), gir1.2-glib-2.0, gir1.2-soup-3.0, gir1.2-gtk-4.0, gir1.2-adw-1, gir1.2-geoclue-2.0, dconf-gsettings-backend | gsettings-backend
Recommends: xdg-desktop-portal-gnome
Maintainer: mathieu <mathieu@localhost>
Description: indicateur météo dans la barre GNOME
 Extension GNOME Shell native pour Ubuntu 26.04. Elle affiche la
 température à côté de l'horloge et des prévisions Open-Meteo.
 Pas de processus en arrière-plan et pas de clé API.
EOF

(
    cd "$STAGE"
    find usr -type f -print0 | sort -z | xargs -0 md5sum
) > "$DEBIAN/md5sums"

OUT="$ROOT/dist/${NAME}_${VERSION}_${ARCH}.deb"
dpkg-deb --root-owner-group --build "$STAGE" "$OUT"
echo "Paquet : $OUT"
