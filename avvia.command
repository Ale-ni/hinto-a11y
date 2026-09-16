#!/bin/bash
# Avvia lo Studio accessibilità Hinto: apre l'interfaccia nel browser.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Manca Node.js. Fai prima doppio clic su installa.command."
  echo "  Premi Invio per chiudere."
  read -r _
  exit 1
fi

# si auto-ripara: se l'installazione non è mai stata fatta, la fa adesso
if [ ! -d node_modules ]; then
  echo ""
  echo "  Prima apertura: completo l'installazione. Ci vogliono pochi minuti."
  npm install --no-audit --no-fund --loglevel=error || exit 1
  npx playwright install chromium || exit 1
fi

echo ""
echo "  Avvio lo Studio. Si apre da solo nel browser."
echo "  Per chiudere: torna in questa finestra e premi Ctrl+C."
echo ""
npm run studio
