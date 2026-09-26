#!/usr/bin/env bash
# Genera el adaptive icon de Android a partir de assets/app-icon.svg.
# Guía de Google: capas de 108x108 dp; el launcher enmascara hasta 72 dp visibles
# y el contenido clave debe quedar dentro del círculo seguro de 66 dp.
# Requiere rsvg-convert e ImageMagick (magick).
set -euo pipefail

cd "$(dirname "$0")/.."
svg=assets/app-icon.svg
res=android/app/src/main/res
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

defs=$(sed -n '/<defs>/,/<\/defs>/p' "$svg")
contenido=$(sed -n '/<g id="tarea-1">/,/^<\/svg>/p' "$svg" | sed '$d')

# Contenido: x 142..943, y 148..952 (centro ~542,550). Escala 0.58 → ~466 px de 1024
# (≈49 dp de 108), con las esquinas de las tarjetas dentro del círculo seguro.
escala=0.58
cat > "$tmp/foreground.svg" <<EOF
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" fill="none">
$defs
<g transform="translate(512 512) scale($escala) translate(-542 -550)">
$contenido
</g>
</svg>
EOF

cat > "$tmp/background.svg" <<EOF
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
$defs
<rect width="1024" height="1024" fill="url(#fondo)"/>
<rect width="1024" height="1024" fill="url(#luz-fondo)"/>
</svg>
EOF

rsvg-convert -w 1024 -h 1024 "$tmp/foreground.svg" -o "$tmp/foreground.png"
rsvg-convert -w 1024 -h 1024 "$tmp/background.svg" -o "$tmp/background.png"

declare -A densidades=([mdpi]=1 [hdpi]=1.5 [xhdpi]=2 [xxhdpi]=3 [xxxhdpi]=4)
for d in "${!densidades[@]}"; do
  capa=$(awk "BEGIN{print int(108*${densidades[$d]})}")
  legacy=$(awk "BEGIN{print int(48*${densidades[$d]})}")
  dir="$res/mipmap-$d"
  for c in foreground background; do
    magick "$tmp/$c.png" -resize "${capa}x${capa}" "$dir/ic_launcher_$c.png"
  done
  # Legacy (API < 26): capas compuestas dentro del círculo/cuadrado redondeado de 48 dp.
  magick "$tmp/background.png" "$tmp/foreground.png" -composite -resize "${legacy}x${legacy}" "$tmp/full.png"
  magick "$tmp/full.png" \( -size "${legacy}x${legacy}" xc:none -fill white \
    -draw "circle $((legacy/2)),$((legacy/2)) $((legacy/2)),1" \) -compose DstIn -composite "$dir/ic_launcher_round.png"
  magick "$tmp/full.png" \( -size "${legacy}x${legacy}" xc:none -fill white \
    -draw "roundrectangle 0,0 $((legacy-1)),$((legacy-1)) $((legacy/6)),$((legacy/6))" \) -compose DstIn -composite "$dir/ic_launcher.png"
done

mkdir -p "$res/mipmap-anydpi-v26"
for nombre in ic_launcher ic_launcher_round; do
  cat > "$res/mipmap-anydpi-v26/$nombre.xml" <<'EOF'
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
EOF
done

cp "$tmp/foreground.png" assets/android-icon-foreground.png
cp "$tmp/background.png" assets/android-icon-background.png
echo "Iconos de Android generados."
