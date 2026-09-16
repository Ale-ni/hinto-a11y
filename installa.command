#!/bin/bash
# Installazione dello Studio accessibilità Hinto.
#
# Pensato per chi non ha mai usato il Terminale: dice a voce alta cosa sta
# facendo, e se manca qualcosa apre da solo la pagina da cui scaricarlo invece
# di stampare un comando da copiare. Si lancia una volta sola, con
#   bash <trascina qui questo file>
# perche' un file scaricato da internet non ha il permesso di essere eseguito.
# Alla fine crea un'icona di avvio che quel problema non ce l'ha.
cd "$(dirname "$0")" || exit 1

echo ""
echo "  ┌──────────────────────────────────────────────┐"
echo "  │   Studio accessibilità Hinto — installazione  │"
echo "  └──────────────────────────────────────────────┘"
echo ""
echo "  Ci vogliono circa cinque minuti. Puoi lasciare"
echo "  la finestra aperta e fare altro."
echo ""

# --- 1. Node -----------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  echo "  ✗ Manca Node.js, che è il motore su cui gira lo strumento."
  echo ""
  echo "    Apro la pagina per scaricarlo. Scegli il pulsante grande a"
  echo "    sinistra (la versione LTS), scarica il file .pkg e installalo"
  echo "    facendo doppio clic e poi sempre Continua."
  echo ""
  echo "    Quando hai finito, CHIUDI questa finestra e fai di nuovo"
  echo "    doppio clic su installa.command."
  echo ""
  open "https://nodejs.org/it/download" 2>/dev/null
  echo "  Premi Invio per chiudere."
  read -r _
  exit 1
fi
echo "  ✓ Node.js $(node --version) trovato"

# --- 2. Dipendenze -----------------------------------------------------
echo ""
echo "  → Scarico i componenti necessari (1-3 minuti)..."
if ! npm install --no-audit --no-fund --loglevel=error; then
  echo ""
  echo "  ✗ Qualcosa non ha funzionato durante il download."
  echo "    Di solito è la rete. Riprova fra qualche minuto; se insiste,"
  echo "    manda una foto di questa finestra ad Alessio."
  echo ""
  echo "  Premi Invio per chiudere."
  read -r _
  exit 1
fi
echo "  ✓ componenti installati"

# --- 3. Browser di lavoro ---------------------------------------------
echo ""
echo "  → Scarico il browser che esegue le analisi (1-2 minuti)..."
if ! npx playwright install chromium; then
  echo "  ✗ Non sono riuscito a scaricare il browser. Vedi sopra."
  echo "  Premi Invio per chiudere."
  read -r _
  exit 1
fi
echo "  ✓ browser pronto"

# --- 4. Un avvio che non dipende dai permessi --------------------------
#
# I file .command scaricati da internet arrivano senza il permesso di essere
# eseguiti, e "chmod +x" da solo non basta sempre: la copia scaricata resta
# anche in quarantena, e se la cartella viene spostata o ricopiata il permesso
# si perde di nuovo. Invece di combattere con questo, costruiamo qui sul posto
# una vera applicazione: generata in locale, non e' scaricata da nessuna parte,
# quindi ha i permessi giusti per definizione e si apre con un doppio clic.
CARTELLA="$(pwd)"

chmod +x avvia.command 2>/dev/null
xattr -d com.apple.quarantine avvia.command 2>/dev/null
xattr -d com.apple.quarantine installa.command 2>/dev/null

echo ""
echo "  → Preparo l'icona di avvio..."

PERCORSO_ESCAPED=$(printf '%s' "$CARTELLA" | sed 's/\\/\\\\/g; s/"/\\"/g')

# crea_app NOME_APP COMANDO_SHELL
crea_app() {
  local app="$1.app" comando="$2" sorgente=".$1.applescript"
  cat > "$sorgente" <<APPLESCRIPT
tell application "Terminal"
	activate
	do script "cd \\"$PERCORSO_ESCAPED\\" && $comando"
end tell
APPLESCRIPT
  rm -rf "$app"
  if osacompile -o "$app" "$sorgente" 2>/dev/null && [ -d "$app" ]; then
    xattr -d -r com.apple.quarantine "$app" 2>/dev/null
    rm -f "$sorgente"
    return 0
  fi
  rm -f "$sorgente"
  return 1
}

# L'icona: osacompile ne mette una generica da AppleScript, che non dice niente
# a chi apre la cartella. Se riusciamo a costruire la nostra, la sostituiamo.
bash scripts/crea-icona.sh 2>/dev/null
vesti_app() {
  [ -f assets/icona.icns ] || return 0
  cp assets/icona.icns "$1.app/Contents/Resources/applet.icns" 2>/dev/null
  touch "$1.app" 2>/dev/null
}

if crea_app "Avvia Studio" "bash avvia.command"; then
  vesti_app "Avvia Studio"
  AVVIO_PRONTO=1
  echo "  ✓ icona «Avvia Studio» creata nella cartella"
else
  AVVIO_PRONTO=0
  echo "  ! non sono riuscito a creare l'icona: userai avvia.command"
fi

# Serve solo a chi distribuisce lo strumento, non a chi lo usa.
if crea_app "Prepara pacchetto" "bash scripts/crea-pacchetto.sh"; then
  vesti_app "Prepara pacchetto"
  echo "  ✓ icona «Prepara pacchetto» creata (serve per dare lo strumento a un collega)"
fi

echo ""
echo "  ────────────────────────────────────────────────"
echo "  Installazione completata."
echo ""
if [ "$AVVIO_PRONTO" = "1" ]; then
  echo "  Da adesso in poi ti serve un gesto solo:"
  echo "  doppio clic su  Avvia Studio"
  echo ""
  echo "  (È la nuova icona comparsa nella cartella. Se"
  echo "   sposti la cartella, rifai l'installazione.)"
else
  echo "  Per avviare lo Studio: apri il Terminale, scrivi"
  echo "  bash seguito da uno spazio, trascina dentro il file"
  echo "  avvia.command e premi Invio."
fi
echo "  ────────────────────────────────────────────────"
echo ""
echo "  Premi Invio per chiudere."
read -r _
