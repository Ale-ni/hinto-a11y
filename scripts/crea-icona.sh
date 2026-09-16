#!/bin/bash
# Costruisce assets/icona.icns a partire da assets/icona-1024.png.
#
# L'immagine sorgente sta nel repository, il .icns no: e' un file binario
# derivato, e ricostruirlo costa mezzo secondo con gli strumenti che macOS ha
# gia' (sips per ridimensionare, iconutil per impacchettare). Per cambiare
# l'icona basta sostituire il PNG - nient'altro.
#
# Silenzioso di proposito: chi lo chiama controlla il codice di uscita.
set -u
cd "$(dirname "$0")/.." || exit 1

SORGENTE="assets/icona-1024.png"
USCITA="assets/icona.icns"

[ -f "$SORGENTE" ] || exit 1
command -v sips >/dev/null 2>&1 || exit 1
command -v iconutil >/dev/null 2>&1 || exit 1

# gia' aggiornata: non c'e' niente da fare
if [ -f "$USCITA" ] && [ "$USCITA" -nt "$SORGENTE" ]; then exit 0; fi

INSIEME="assets/icona.iconset"
rm -rf "$INSIEME"
mkdir -p "$INSIEME" || exit 1

for lato in 16 32 128 256 512; do
  sips -z "$lato" "$lato" "$SORGENTE" --out "$INSIEME/icon_${lato}x${lato}.png" >/dev/null 2>&1 || { rm -rf "$INSIEME"; exit 1; }
  doppio=$((lato * 2))
  sips -z "$doppio" "$doppio" "$SORGENTE" --out "$INSIEME/icon_${lato}x${lato}@2x.png" >/dev/null 2>&1 || { rm -rf "$INSIEME"; exit 1; }
done

iconutil -c icns "$INSIEME" -o "$USCITA" >/dev/null 2>&1 || { rm -rf "$INSIEME"; exit 1; }
rm -rf "$INSIEME"
exit 0
