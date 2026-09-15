#!/usr/bin/env bash
# Preparazione dell'ambiente per una scansione reale.
# Da lanciare una sola volta dentro la cartella del motore.
set -euo pipefail

echo "==> Node: $(node --version 2>/dev/null || echo 'NON TROVATO')"
echo "==> npm:  $(npm --version 2>/dev/null || echo 'NON TROVATO')"

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "Node non è installato. Su macOS con Homebrew: brew install node"
  exit 1
fi

echo
echo "==> Installazione delle dipendenze..."
npm install --no-audit --no-fund

echo
echo "==> Installazione di Chromium per Playwright..."
# Se la variabile A11Y_CHROMIUM_PATH è già impostata su un Chromium esistente,
# questo passaggio si può saltare.
npx playwright install chromium

# Il permesso di esecuzione non sopravvive a tutti i modi di distribuire i file
# (l'upload dal web di GitHub, per esempio, lo perde). Senza, il doppio clic su
# avvia.command da' "permesso negato" - e chi lo riceve non ha modo di capire
# perche'. Si ripristina qui, cosi' il percorso dei designer resta: lancia
# questo una volta, poi solo doppi clic.
if [ -f avvia.command ]; then
  chmod +x avvia.command
  echo
  echo "==> avvia.command reso cliccabile."
fi

echo
echo "==> Verifica raggiungibilità del bersaglio..."
TARGET="${1:-https://www.hintogroup.eu}"
if curl -sS -o /dev/null -w "   HTTP %{http_code} in %{time_total}s\n" --max-time 20 "$TARGET"; then
  echo "   Rete OK."
else
  echo "   ATTENZIONE: il bersaglio non è raggiungibile da questa shell."
  echo "   La scansione fallirà finché la rete non è disponibile."
fi

echo
echo "Pronto."
echo
echo "Da qui in avanti non serve piu' il terminale:"
echo "   doppio clic su  avvia.command   apre lo Studio nel browser."
echo
echo "Per chi preferisce la riga di comando:"
echo "   npm run studio                        interfaccia"
echo "   npm run audit -- --smoke config.X.json  giro di prova"
echo "   npm run audit -- config.X.json          analisi completa"
