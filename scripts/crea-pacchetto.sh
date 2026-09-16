#!/bin/bash
#
# Costruisce il pacchetto da consegnare a un collega: una sola applicazione,
# "Studio accessibilita.app", che contiene il codice e Node.js e non chiede
# nulla a chi la riceve.
#
# Perche' serve costruirlo qui invece di tenerlo nel repo: un file che passa
# dal caricamento web di GitHub perde il permesso di essere eseguito, e
# un'applicazione senza quel permesso non si apre. Costruita sul Mac e
# compressa con ditto, l'app conserva i permessi; il file .zip va poi allegato
# a una Release su GitHub, che lo serve identico a come lo riceve.
#
# Gira su Mac con chip Apple (M1 e successivi). Non produce la versione Intel:
# scelta deliberata, vedi CHANGELOG 0.5.0.
set -u

cd "$(dirname "$0")/.." || exit 1
RADICE="$(pwd)"
USCITA="$RADICE/pacchetto"
APP="$USCITA/Studio accessibilita.app"
RIGA="  ────────────────────────────────────────────────"

echo ""
echo "  ┌──────────────────────────────────────────────┐"
echo "  │   Preparazione del pacchetto per un collega   │"
echo "  └──────────────────────────────────────────────┘"
echo ""

fallisci() {
  echo ""
  echo "  ✗ $1"
  echo ""
  echo "  Premi Invio per chiudere."
  read -r _
  exit 1
}

# --- 0. Controlli ------------------------------------------------------
if [ "$(uname -m)" != "arm64" ]; then
  fallisci "Questo Mac non ha un chip Apple: il pacchetto prodotto qui non
    funzionerebbe sui Mac dei colleghi. Serve un Mac M1 o successivo."
fi
command -v node >/dev/null 2>&1 || fallisci "Manca Node.js su questo Mac. Rifai prima l'installazione."
command -v rsync >/dev/null 2>&1 || fallisci "Manca rsync, che di norma e' incluso in macOS."

VERSIONE=$(node -p "require('./package.json').version" 2>/dev/null) || VERSIONE="0.0.0"
echo "  Versione del motore: $VERSIONE"

rm -rf "$USCITA"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" || fallisci "Non riesco a scrivere nella cartella."

# --- 1. Node.js --------------------------------------------------------
echo ""
echo "  → Scarico Node.js da includere nel pacchetto (~50 MB)..."

INDICE=$(curl -fsSL https://nodejs.org/dist/latest-v22.x/) \
  || fallisci "Non riesco a raggiungere nodejs.org. Controlla la rete e riprova."
NOME=$(printf '%s' "$INDICE" | sed -n 's/.*\(node-v22[0-9.]*-darwin-arm64\.tar\.gz\).*/\1/p' | head -1)
[ -n "$NOME" ] || fallisci "Non trovo la versione di Node per Mac Apple sulla pagina di nodejs.org."

curl -fL --progress-bar -o "$USCITA/node.tar.gz" "https://nodejs.org/dist/latest-v22.x/$NOME" \
  || fallisci "Il download di Node.js non e' andato a buon fine."
tar xzf "$USCITA/node.tar.gz" -C "$USCITA" || fallisci "L'archivio di Node.js e' danneggiato."
mv "$USCITA/${NOME%.tar.gz}" "$APP/Contents/Resources/node" || fallisci "Non riesco a spostare Node.js nel pacchetto."
rm -f "$USCITA/node.tar.gz"
# roba che serve solo a chi compila codice C: via, sono una decina di MB
rm -rf "$APP/Contents/Resources/node/include" "$APP/Contents/Resources/node/share"
echo "  ✓ ${NOME%-darwin-arm64.tar.gz} incluso"

# --- 2. Il codice ------------------------------------------------------
echo ""
echo "  → Copio il codice del motore..."
rsync -a \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'out' \
  --exclude 'out-*' \
  --exclude 'pacchetto' \
  --exclude 'confronto' \
  --exclude '_aggiorna-github' \
  --exclude '_per-github' \
  --exclude '*.zip' \
  --exclude '*.app' \
  --exclude '.DS_Store' \
  --exclude 'consent-state.json' \
  --exclude '*.jsonl' \
  "$RADICE/" "$APP/Contents/Resources/payload/" || fallisci "Copia del codice non riuscita."
echo "  ✓ codice copiato"

# --- 3. L'avvio --------------------------------------------------------
# Due script: quello che macOS lancia al doppio clic (MacOS/studio) e quello
# che fa il lavoro dentro una finestra di Terminale visibile (Resources/
# esegui.command). Il primo apre il secondo: serve perche' un'app lanciata dal
# Finder non ha una finestra dove mostrare cosa sta facendo, e la prima
# installazione dura qualche minuto.
cat > "$APP/Contents/MacOS/studio" <<'LANCIATORE'
#!/bin/bash
RISORSE="$(cd "$(dirname "$0")/../Resources" && pwd)"
open -a Terminal "$RISORSE/esegui.command"
LANCIATORE

cat > "$APP/Contents/Resources/esegui.command" <<'ESEGUI'
#!/bin/bash
# Cuore dell'applicazione: prepara la cartella di lavoro e avvia lo Studio.
RISORSE="$(cd "$(dirname "$0")" && pwd)"
LAVORO="$HOME/Documents/Studio accessibilita"
export PATH="$RISORSE/node/bin:$PATH"

echo ""
echo "  ┌──────────────────────────────────────────────┐"
echo "  │          Studio accessibilità Hinto          │"
echo "  └──────────────────────────────────────────────┘"
echo ""

chiudi() {
  echo ""
  echo "  Premi Invio per chiudere."
  read -r _
  exit "${1:-0}"
}

# La cartella di lavoro sta in Documenti e non dentro l'applicazione: e' li'
# che finiscono le analisi, e deve restare raggiungibile anche se un domani
# l'app viene sostituita con una versione nuova.
if [ ! -d "$LAVORO" ]; then
  echo "  Prima apertura: preparo la cartella di lavoro in"
  echo "  Documenti/Studio accessibilita"
  echo ""
  mkdir -p "$LAVORO" || { echo "  ✗ Non riesco a creare la cartella."; chiudi 1; }
fi

# Il codice viene riallineato a ogni avvio: cosi' aggiornare significa
# sostituire l'applicazione, senza toccare le analisi gia' fatte.
rsync -a --exclude 'node_modules' --exclude 'out' --exclude 'out-*' \
  "$RISORSE/payload/" "$LAVORO/" 2>/dev/null

cd "$LAVORO" || { echo "  ✗ Non riesco ad aprire la cartella di lavoro."; chiudi 1; }

if [ ! -d node_modules ] || [ package.json -nt node_modules ]; then
  echo "  → Installo i componenti necessari. Qualche minuto, una volta sola."
  echo ""
  npm install --no-audit --no-fund --loglevel=error || {
    echo ""
    echo "  ✗ Installazione dei componenti non riuscita. Di solito e' la rete:"
    echo "    riprova fra qualche minuto. Se insiste, foto di questa finestra"
    echo "    ad Alessio."
    chiudi 1
  }
  echo "  → Scarico il browser che esegue le analisi. Ancora un paio di minuti."
  echo ""
  npx playwright install chromium || {
    echo ""
    echo "  ✗ Download del browser non riuscito. Vedi sopra."
    chiudi 1
  }
  touch node_modules
  echo ""
  echo "  ✓ Tutto pronto. Le prossime aperture saranno immediate."
fi

echo ""
echo "  Avvio lo Studio: si apre da solo nel browser."
echo "  Per chiudere: torna in questa finestra e premi Ctrl+C."
echo ""
npm run studio
chiudi 0
ESEGUI

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleName</key>
	<string>Studio accessibilita</string>
	<key>CFBundleDisplayName</key>
	<string>Studio accessibilità</string>
	<key>CFBundleIdentifier</key>
	<string>com.hinto.studio-accessibilita</string>
	<key>CFBundleVersion</key>
	<string>$VERSIONE</string>
	<key>CFBundleShortVersionString</key>
	<string>$VERSIONE</string>
	<key>CFBundleExecutable</key>
	<string>studio</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>LSMinimumSystemVersion</key>
	<string>12.0</string>
	<key>NSHighResolutionCapable</key>
	<true/>
</dict>
</plist>
PLIST

chmod +x "$APP/Contents/MacOS/studio" "$APP/Contents/Resources/esegui.command" \
  || fallisci "Non riesco a impostare i permessi di esecuzione."

# --- 4. L'archivio -----------------------------------------------------
# ditto, non zip: conserva i permessi di esecuzione e i metadati del bundle.
echo ""
echo "  → Comprimo il pacchetto..."
ARCHIVIO="$USCITA/Studio-accessibilita-$VERSIONE.zip"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$ARCHIVIO" \
  || fallisci "Compressione non riuscita."

PESO=$(du -h "$ARCHIVIO" | cut -f1 | tr -d ' ')
echo "  ✓ archivio creato ($PESO)"

echo ""
echo "$RIGA"
echo "  Pacchetto pronto:"
echo "  pacchetto/Studio-accessibilita-$VERSIONE.zip"
echo ""
echo "  Come consegnarlo:"
echo "  1. Su GitHub apri il repo → Releases → Draft a new release"
echo "  2. Tag: v$VERSIONE — poi trascina il file .zip nella pagina"
echo "  3. Publish release, e manda al collega il link della Release"
echo ""
echo "  Non mandarlo via Drive o come allegato: il .zip contiene"
echo "  un'applicazione e i filtri aziendali lo bloccano."
echo "$RIGA"

open "$USCITA" 2>/dev/null
echo ""
echo "  Premi Invio per chiudere."
read -r _
