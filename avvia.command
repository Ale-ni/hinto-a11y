#!/bin/bash
# Avvia lo Studio accessibilità Hinto.
#
# Questo file e' l'unico posto in cui e' scritto COME si apre lo Studio: lo usa
# il doppio clic sull'icona nella cartella del codice, e lo usa l'applicazione
# impacchettata. Se la logica vivesse in due posti, uno dei due resterebbe
# indietro - cosa gia' successa una volta.
cd "$(dirname "$0")" || exit 1

INDIRIZZO="http://127.0.0.1:4173"

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Manca Node.js. Fai prima doppio clic su installa.command."
  echo "  Premi Invio per chiudere."
  read -r _
  exit 1
fi

# si auto-ripara: se l'installazione non e' mai stata fatta, la fa adesso
if [ ! -x node_modules/.bin/tsx ]; then
  echo ""
  echo "  Prima apertura: completo l'installazione. Ci vogliono pochi minuti."
  npm install --no-audit --no-fund --loglevel=error || exit 1
fi

# Il browser che ESEGUE LE ANALISI lo fornisce Playwright. Dove sia lo dice
# Playwright stesso: cercarlo a mano per percorso e' il modo di sbagliare
# appena cambia versione o appena qualcuno sposta la cache dei browser.
motore_analisi() {
  node -e "try{process.stdout.write(require('playwright').chromium.executablePath())}catch(e){}" 2>/dev/null
}

if [ ! -x "$(motore_analisi)" ]; then
  echo ""
  echo "  Scarico il browser che esegue le analisi. Un paio di minuti."
  npx playwright install chromium || exit 1
fi

# Il browser che MOSTRA LA FINESTRA e' un'altra cosa, e non deve essere quello
# di Playwright: le build "Chrome for Testing" espongono di proposito una barra
# che avverte di non usarle per navigare. Giusto per loro, sbagliato per noi.
# Quindi: si prende un browser normale gia' installato, con un profilo tutto
# suo che non tocca quello personale di chi lo usa.
posizione_finestra() {
  local p
  for p in \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "$HOME/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \
    "/Applications/Chromium.app/Contents/MacOS/Chromium" \
    "/Applications/Vivaldi.app/Contents/MacOS/Vivaldi"; do
    if [ -x "$p" ]; then printf '%s' "$p"; return 0; fi
  done
  # Ripiego: quello di Playwright. La barra dell'avviso compare, ma una
  # finestra con un avviso e' meglio di nessuna finestra.
  p=$(motore_analisi)
  [ -x "$p" ] && printf '%s' "$p"
}

FINESTRA=$(posizione_finestra)

echo ""

if [ -x "$FINESTRA" ]; then
  # Percorso normale: lo Studio vive in una finestra sua, senza schede ne'
  # barra degli indirizzi. Il profilo e' separato da quello personale.
  echo "  Avvio lo Studio nella sua finestra."
  echo ""
  export A11Y_STUDIO_NO_OPEN=1
  if [ -t 1 ]; then
    npm run studio &
  else
    npm run studio > studio.log 2>&1 &
  fi
  SERVER=$!
  trap 'kill $SERVER 2>/dev/null' EXIT

  for _ in $(seq 1 60); do
    curl -s -o /dev/null "$INDIRIZZO" && break
    kill -0 "$SERVER" 2>/dev/null || break
    sleep 0.5
  done

  # Solo nel caso di ripiego sul browser di Playwright: --test-type riduce le
  # barre di avviso. Su un browser normale non serve, e non lo passiamo.
  EXTRA=()
  [ "$FINESTRA" = "$(motore_analisi)" ] && EXTRA=(--test-type)

  # Un profilo per browser, non uno solo: un profilo scritto da una versione
  # di Chrome non si apre con una piu' vecchia, e cambiando browser ci si
  # ritroverebbe con una finestra che si rifiuta di partire.
  PROFILO="$PWD/.finestra/$(printf '%s' "$FINESTRA" | shasum | cut -c1-8)"
  mkdir -p "$PROFILO"

  "$FINESTRA" \
    --app="$INDIRIZZO" \
    --user-data-dir="$PROFILO" \
    --no-first-run --no-default-browser-check "${EXTRA[@]}" >/dev/null 2>&1
  exit 0
fi

# Ripiego: meglio una scheda del browser predefinito che nessuna finestra.
echo "  Browser dedicato non disponibile: apro nel browser predefinito."
echo "  Per chiudere: torna in questa finestra e premi Ctrl+C."
echo ""
npm run studio
