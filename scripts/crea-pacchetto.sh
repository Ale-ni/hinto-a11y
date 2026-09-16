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
# Punto d'ingresso dell'applicazione: quello che parte al doppio clic.
RISORSE="$(cd "$(dirname "$0")/../Resources" && pwd)"

# Due cartelle, due scopi.
#
# MOTORE tiene il codice e le dipendenze. E' roba di sistema: sta in Libreria,
# dove macOS mette le cose che i programmi gestiscono da soli, e nessuno la
# apre mai.
#
# DATI tiene i progetti e i risultati. Sta in Documenti, si apre nel Finder, e
# deve contenere le cose di chi lavora e nient'altro: e' la differenza fra una
# cartella di lavoro e una cartella di installazione.
MOTORE="$HOME/Library/Application Support/Studio accessibilita"
DATI="$HOME/Documents/Studio accessibilita"

export PATH="$RISORSE/node/bin:$PATH"

# Tutto quello che si scarica finisce dentro MOTORE, non nelle cartelle
# condivise dell'utente. Motivo osservato sul campo: su un Mac dove in passato
# qualcuno ha lanciato npm con sudo, ~/.npm appartiene a root e l'installazione
# muore con "permission denied" senza che l'utente abbia modo di accorgersene o
# di rimediare. Con una cache tutta nostra il problema non si pone, e
# disinstallare vuol dire cancellare due cartelle.
export npm_config_cache="$MOTORE/.npm-cache"
export npm_config_audit=false
export npm_config_fund=false
export npm_config_update_notifier=false
export PLAYWRIGHT_BROWSERS_PATH="$MOTORE/.browser"
export A11Y_DATI="$DATI"

# Vero quando il motore e' installato per davvero: non basta che la cartella
# esista, un'installazione interrotta a meta' ne lascia una parziale.
motore_pronto() {
  [ -x "$MOTORE/node_modules/.bin/tsx" ] || return 1
  local b
  b=$(cd "$MOTORE" && node -e "try{process.stdout.write(require('playwright').chromium.executablePath())}catch(e){}" 2>/dev/null)
  [ -x "$b" ]
}

# Prima apertura, o installazione rimasta a meta': si passa dalla finestra di
# Terminale. E' l'unico posto dove chi apre il programma vede che sta lavorando
# durante i minuti dell'installazione, e legge il messaggio se qualcosa va
# storto. Dalle aperture successive il Terminale non compare piu'.
if ! motore_pronto; then
  open -a Terminal "$RISORSE/esegui.command"
  exit 0
fi

mkdir -p "$DATI"
rsync -a --exclude 'node_modules' "$RISORSE/payload/" "$MOTORE/" 2>/dev/null
cd "$MOTORE" || exit 1

# Come si apre lo Studio e' scritto una volta sola, in avvia.command: qui lo si
# esegue e basta. Senza Terminale: questa e' l'apertura di tutti i giorni.
exec bash avvia.command
LANCIATORE

cat > "$APP/Contents/Resources/esegui.command" <<'ESEGUI'
#!/bin/bash
# Cuore dell'applicazione: installa quello che manca e poi si toglie di mezzo.
RISORSE="$(cd "$(dirname "$0")" && pwd)"

# Due cartelle, due scopi.
#
# MOTORE tiene il codice e le dipendenze. E' roba di sistema: sta in Libreria,
# dove macOS mette le cose che i programmi gestiscono da soli, e nessuno la
# apre mai.
#
# DATI tiene i progetti e i risultati. Sta in Documenti, si apre nel Finder, e
# deve contenere le cose di chi lavora e nient'altro: e' la differenza fra una
# cartella di lavoro e una cartella di installazione.
MOTORE="$HOME/Library/Application Support/Studio accessibilita"
DATI="$HOME/Documents/Studio accessibilita"

export PATH="$RISORSE/node/bin:$PATH"

# Tutto quello che si scarica finisce dentro MOTORE, non nelle cartelle
# condivise dell'utente. Motivo osservato sul campo: su un Mac dove in passato
# qualcuno ha lanciato npm con sudo, ~/.npm appartiene a root e l'installazione
# muore con "permission denied" senza che l'utente abbia modo di accorgersene o
# di rimediare. Con una cache tutta nostra il problema non si pone, e
# disinstallare vuol dire cancellare due cartelle.
export npm_config_cache="$MOTORE/.npm-cache"
export npm_config_audit=false
export npm_config_fund=false
export npm_config_update_notifier=false
export PLAYWRIGHT_BROWSERS_PATH="$MOTORE/.browser"
export A11Y_DATI="$DATI"

# Vero quando il motore e' installato per davvero: non basta che la cartella
# esista, un'installazione interrotta a meta' ne lascia una parziale.
motore_pronto() {
  [ -x "$MOTORE/node_modules/.bin/tsx" ] || return 1
  local b
  b=$(cd "$MOTORE" && node -e "try{process.stdout.write(require('playwright').chromium.executablePath())}catch(e){}" 2>/dev/null)
  [ -x "$b" ]
}

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

mkdir -p "$DATI" "$MOTORE" || { echo "  ✗ Non riesco a creare le cartelle."; chiudi 1; }

# Chi arriva da una versione precedente ha il codice mescolato ai propri
# progetti dentro Documenti. Non si cancella niente: si sposta da parte, e
# glielo si dice.
if [ -d "$DATI/src" ]; then
  echo "  Riordino la cartella di lavoro: i file di sistema della versione"
  echo "  precedente vanno da parte, i tuoi progetti restano dove sono."
  echo ""
  VECCHIO="$DATI/_motore-precedente"
  mkdir -p "$VECCHIO"
  for v in src scripts fixtures test docs prompts assets node_modules \
           package.json package-lock.json tsconfig.json README.md CHANGELOG.md \
           NOTICE.md INSTALLAZIONE.md avvia.command installa.command setup.sh \
           config.example.json config.fixture.json config.hinto.json \
           config.react.json studio.log; do
    [ -e "$DATI/$v" ] && mv "$DATI/$v" "$VECCHIO/" 2>/dev/null
  done
  # queste invece si recuperano: sono i megabyte gia' scaricati
  for h in .browser .npm-cache; do
    if [ -d "$DATI/$h" ] && [ ! -d "$MOTORE/$h" ]; then mv "$DATI/$h" "$MOTORE/" 2>/dev/null; fi
  done
fi

rsync -a --exclude 'node_modules' "$RISORSE/payload/" "$MOTORE/" 2>/dev/null
cd "$MOTORE" || { echo "  ✗ Non riesco ad aprire la cartella del motore."; chiudi 1; }

if ! motore_pronto || [ package.json -nt node_modules ]; then
  echo "  → Installo i componenti necessari. Qualche minuto, una volta sola."
  echo ""
  npm install --no-audit --no-fund --loglevel=error || {
    echo ""
    echo "  ✗ Installazione dei componenti non riuscita."
    echo ""
    echo "    Le righe qui sopra dicono perche'. Le due cause tipiche:"
    echo "    - se compare ETIMEDOUT, ENOTFOUND o ECONNRESET e' la rete:"
    echo "      riprova fra qualche minuto;"
    echo "    - se compare EACCES o permission denied e' un permesso su questo"
    echo "      Mac: manda la foto della finestra ad Alessio, si risolve dal"
    echo "      programma senza che tu debba fare niente."
    echo ""
    echo "    In ogni altro caso: foto di questa finestra ad Alessio."
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
  echo "  ✓ Tutto pronto. Le prossime aperture saranno immediate:"
  echo "    doppio clic sull'applicazione, e basta."
fi

if [ -d "$DATI/_motore-precedente" ]; then
  echo ""
  echo "  Nota: in Documenti/Studio accessibilita trovi una cartella"
  echo "  _motore-precedente con i file della versione vecchia."
  echo "  Puoi cancellarla quando vuoi."
fi

# Da qui in poi il lavoro lo fa la finestra dell'applicazione: questa finestra
# di Terminale serviva solo all'installazione e si toglie di mezzo.
APPLICAZIONE="$(cd "$RISORSE/../.." && pwd)"
echo ""
echo "  Apro lo Studio nella sua finestra."
echo "  Questa finestra la puoi chiudere."
echo ""
if open "$APPLICAZIONE" 2>/dev/null; then
  exit 0
fi

echo "  (apertura della finestra non riuscita: proseguo da qui)"
echo ""
exec bash avvia.command
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
	<key>CFBundleIconFile</key>
	<string>icona</string>
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

# --- 3bis. L'icona ------------------------------------------------------
if bash scripts/crea-icona.sh && [ -f assets/icona.icns ]; then
  cp assets/icona.icns "$APP/Contents/Resources/icona.icns"
  echo "  ✓ icona applicata"
else
  # Senza icona l'app funziona lo stesso, con quella generica di sistema.
  sed -i '' '/<key>CFBundleIconFile<\/key>/,+1d' "$APP/Contents/Info.plist" 2>/dev/null
  echo "  ! icona non generata: l'app usera' quella generica"
fi

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
