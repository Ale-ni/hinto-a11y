#!/bin/bash
# Installazione dello Studio accessibilità Hinto.
#
# Pensato per chi non ha mai usato il Terminale: si apre con un doppio clic,
# dice a voce alta cosa sta facendo, e se manca qualcosa apre da solo la pagina
# da cui scaricarlo invece di stampare un comando da copiare.
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

# --- 4. Permessi -------------------------------------------------------
chmod +x avvia.command 2>/dev/null

echo ""
echo "  ────────────────────────────────────────────────"
echo "  Installazione completata."
echo ""
echo "  Da adesso in poi ti serve un gesto solo:"
echo "  doppio clic su  avvia.command"
echo ""
echo "  (La prima volta macOS chiederà conferma: clic destro"
echo "   sul file, poi Apri, poi di nuovo Apri.)"
echo "  ────────────────────────────────────────────────"
echo ""
echo "  Premi Invio per chiudere."
read -r _
