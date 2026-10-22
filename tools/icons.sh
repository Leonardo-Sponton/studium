#!/usr/bin/env bash
# Renders every app icon from resources/mark.svg, the open-book mark (needs rsvg-convert, from
# the librsvg package). Run it again after changing the SVGs; the PNGs are committed.
set -euo pipefail
cd "$(dirname "$0")/.."
R=resources
RES=android/app/src/main/res
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
BG="#010a29"
# The mark's shapes, placed with a nested <svg x y width height>.
MARK=$(grep -v '<svg\|</svg>\|<!--' $R/mark.svg)
mark() { echo "<svg x=\"$1\" y=\"$2\" width=\"$3\" height=\"$3\" viewBox=\"0 0 512 512\">$MARK</svg>"; }

# The app icon: a rounded dark square with a faint violet edge.
cat > $R/icon.svg <<SVG
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect x="16" y="16" width="480" height="480" rx="108" fill="$BG"/>
  <rect x="16" y="16" width="480" height="480" rx="108" fill="none" stroke="#a67cff" stroke-opacity=".35" stroke-width="6"/>
  $(mark 0 0 512)
</svg>
SVG

# Desktop: the window and package icon.
rsvg-convert -w 512 -h 512 $R/icon.svg -o $R/icon.png

# Android round icon: the same mark on a circle.
cat > "$TMP/round.svg" <<SVG
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <circle cx="256" cy="256" r="240" fill="$BG"/>
  $(mark 38 38 436)
</svg>
SVG
# Adaptive icon foreground: the mark inside the 66 dp safe circle of the 108 dp canvas.
cat > "$TMP/fg.svg" <<SVG
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  $(mark 96 96 320)
</svg>
SVG
for d in mdpi:1 hdpi:1.5 xhdpi:2 xxhdpi:3 xxxhdpi:4; do
  n=${d%%:*} s=${d##*:}
  px() { awk "BEGIN{print int($1*$s+0.5)}"; }
  rsvg-convert -w "$(px 48)" -h "$(px 48)" $R/icon.svg -o $RES/mipmap-$n/ic_launcher.png
  rsvg-convert -w "$(px 48)" -h "$(px 48)" "$TMP/round.svg" -o $RES/mipmap-$n/ic_launcher_round.png
  rsvg-convert -w "$(px 108)" -h "$(px 108)" "$TMP/fg.svg" -o $RES/mipmap-$n/ic_launcher_foreground.png
done

# Splash screens: the mark centered on the dark background, at every size Capacitor made.
for f in $RES/drawable*/splash.png; do
  read -r w h < <(file -b "$f" | sed -E 's/.*, ([0-9]+) x ([0-9]+),.*/\1 \2/')
  m=$(( (w < h ? w : h) * 2 / 5 ))
  cat > "$TMP/splash.svg" <<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="$w" height="$h" viewBox="0 0 $w $h">
  <rect width="$w" height="$h" fill="$BG"/>
  $(mark $(( (w - m) / 2 )) $(( (h - m) / 2 )) $m)
</svg>
SVG
  rsvg-convert "$TMP/splash.svg" -o "$f"
done
echo "Icons written."
