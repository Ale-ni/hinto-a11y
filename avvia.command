#!/bin/bash
# Avvia lo Studio accessibilità Hinto.
#
# Esiste perche' l'interfaccia deve raggiungere il sito del cliente e aprire un
# browser vero, quindi gira sul portatile di chi lavora. Questo file si apre con
# un doppio clic dal Finder: e' tutto cio' che serve sapere per usarla.
#
# Se al primo doppio clic macOS dice che il file "non puo' essere aperto":
# clic destro sul file, poi "Apri", poi di nuovo "Apri" nella finestra.
cd "$(dirname "$0")" || exit 1
if [ ! -d node_modules ]; then
  echo "Prima installazione: ci vuole qualche minuto."
  npm install || exit 1
  npx playwright install chromium || exit 1
fi
npm run studio
