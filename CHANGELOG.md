# Changelog

Il numero di versione va citato nei rapporti consegnati: se un cliente contesta
un finding, bisogna poter dire con quale versione del motore è stato prodotto.

Formato: [Keep a Changelog](https://keepachangelog.com/it/1.1.0/).
Versionamento semantico.

---

## [0.6.0] — 2026-09-16

Chi apriva `Documenti/Studio accessibilita` trovava i propri progetti mescolati
a `src/`, `node_modules/`, `package.json` e ai file di configurazione di
esempio. Sembra un dettaglio estetico: non lo è. Una cartella in cui non si
capisce cosa è tuo e cosa è del programma è una cartella in cui prima o poi
qualcuno cancella la cosa sbagliata.

### Modificato — struttura delle cartelle

Il server ora distingue due radici:

- **`RADICE`** — il codice, le dipendenze, i file di esempio. Con
  l'applicazione va in `~/Libreria/Application Support/Studio accessibilita`,
  dove macOS tiene ciò che i programmi gestiscono da soli.
- **`DATI`** — i `config.*.json` dei clienti, le cartelle `out-*`, le
  revisioni. Resta in `Documenti/Studio accessibilita`, e ora contiene
  **soltanto quello**.

La seconda si imposta con la variabile `A11Y_DATI`. **Se non è impostata le due
coincidono**: chi lavora dentro il repository non vede alcun cambiamento, ed è
giusto così — lì la separazione non serve.

Di conseguenza il comando di analisi non viene più lanciato con `npx` dalla
cartella del progetto, ma con il percorso assoluto di `tsx` e la cartella di
lavoro dell'utente: `npx` cerca i pacchetti a partire dalla cartella corrente,
che ora non è più quella del codice.

### Migrazione automatica

All'apertura, una cartella di lavoro che contiene ancora il codice di una
versione precedente viene riordinata: i file di sistema finiscono in
`_motore-precedente`, **nulla viene cancellato**, e l'utente legge dove sono
finiti. Il browser già scaricato e la cache di npm vengono invece recuperati,
per non rifare duecento megabyte di download.

### Modificato — icona

Nuova icona: simbolo di accessibilità bianco su fondo viola `#633beb`, al posto
del segno di spunta verde. La favicon della finestra è stata rifatta uguale.

---

## [0.5.5] — 2026-09-16

### Aggiunto

- **Icona propria**, al posto di quella generica di AppleScript e di quella di
  sistema. L'immagine sorgente è un PNG in `assets/`; `scripts/crea-icona.sh` la
  converte in `.icns` con gli strumenti già presenti in macOS (`sips`,
  `iconutil`), e l'icona finisce sia sull'applicazione impacchettata sia sulle
  due icone create dall'installazione. Per cambiarla basta sostituire il PNG:
  il `.icns` è un derivato e non sta nel repository.
- **Favicon** dello Studio, SVG in linea nella pagina: niente file in più da
  servire e resta nitida a ogni dimensione.

### Nota sulla richiesta di estendere ad altri browser

Firefox e Safari **non possono** ospitare la finestra dello Studio. La finestra
senza schede né barra degli indirizzi si ottiene con il flag `--app`, che esiste
solo nei browser derivati da Chromium. Firefox non ha un equivalente — `--kiosk`
occupa tutto lo schermo, che è un'altra cosa — e Safari non espone alcun modo da
riga di comando per aprirsi così. Resta il ripiego su Playwright, quindi nessun
Mac resta senza finestra.

Il **riquadro nel Dock** mentre lo Studio è aperto resta quello del browser che
disegna la finestra: quel processo è suo, e cambiarne l'icona richiederebbe un
involucro nativo (Electron o simili) — molti megabyte e un'altra categoria di
manutenzione, per un guadagno solo estetico.

---

## [0.5.4] — 2026-09-16

La finestra dedicata funzionava, ma in cima portava una barra nera: *«Chrome
for Testing è riservato ai test automatici»*. Vera, e fuori posto in uno
strumento che si mostra a un cliente.

### Contesto

Avevo riusato per la finestra lo stesso browser che esegue le analisi — la
build che Playwright scarica. Quella build espone l'avviso di proposito, ed è
giusto che lo faccia: non è pensata per navigarci. L'errore è stato mio, aver
trattato come una cosa sola due funzioni diverse: *eseguire le analisi* e
*mostrare l'interfaccia*.

### Modificato

- Le due cose sono ora separate. Le analisi continuano a girare sul browser di
  Playwright, che è quello giusto: controllato, versione nota, riproducibile.
  La finestra usa invece un **browser normale già installato** (Chrome, Edge,
  Brave, Chromium, Vivaldi, nell'ordine), sempre con un profilo tutto suo che
  non tocca quello personale.
- **Un profilo per browser**, non uno condiviso: un profilo scritto da una
  versione di Chrome non si riapre con una più vecchia, e cambiando browser la
  finestra si rifiuterebbe di partire.
- Se nessun browser normale è installato si ripiega su quello di Playwright con
  `--test-type`, che riduce le barre di avviso. Una finestra con un avviso resta
  meglio di nessuna finestra.

---

## [0.5.3] — 2026-09-16

La 0.5.2 prometteva una finestra applicazione e in pratica apriva ancora una
scheda di Chrome. Due cause diverse, stessa radice.

### Contesto

La prima: la logica della finestra l'avevo scritta **dentro il lanciatore
dell'applicazione impacchettata**, mentre `avvia.command` — quello che parte
dall'icona nella cartella del codice — era rimasto alla versione vecchia. Due
modi di avviare lo stesso programma, uno solo aggiornato. È lo stesso errore
strutturale del bit di esecuzione: una cosa scritta in due posti si scollega.

La seconda: il lanciatore cercava Chromium **per percorso**, dentro la cartella
di lavoro. Una cartella creata da una versione precedente ha i browser altrove,
il percorso non trova niente, e si ripiega sul browser predefinito — cioè
esattamente il comportamento che la versione doveva eliminare.

### Corretto

- **Come si apre lo Studio è scritto in un posto solo**, `avvia.command`. Il
  lanciatore dell'applicazione ora ci si limita a delegare (`exec bash
  avvia.command`) dopo aver preparato l'ambiente. I due percorsi non possono
  più divergere.
- **Il percorso del browser lo dichiara Playwright**, tramite
  `chromium.executablePath()`, invece di essere ricostruito a mano. Cercarlo per
  percorso si rompe appena cambia versione o cambia la posizione della cache.
- Il controllo di «installazione completa» ora verifica **anche la presenza del
  browser**, non solo dei componenti: una cartella di lavoro ereditata da una
  versione precedente viene riportata in pari invece di partire monca.

### Nota

Se il browser dedicato davvero non c'è e non si riesce a scaricarlo, lo Studio
si apre nel browser predefinito con un avviso esplicito. Una scheda in più è
meglio di nessuna finestra — ma ora è una scelta dichiarata, non un silenzio.

---

## [0.5.2] — 2026-09-16

L'applicazione c'era, ma apriva un Terminale che apriva un browser: tre cose
sullo schermo per un programma solo, e la chiusura affidata a un `Ctrl+C` in una
finestra nera che nessuno associa al programma che sta usando.

### Modificato

- **L'uso quotidiano non passa più dal Terminale.** L'applicazione avvia il
  server in secondo piano e apre una finestra Chromium in *modalità
  applicazione*: niente schede, niente barra degli indirizzi, icona propria nel
  Dock. Chromium è quello che Playwright ha già scaricato per le analisi, quindi
  il pacchetto non cresce di un byte, e gira su un profilo separato che non
  tocca il Chrome personale di chi lo usa.
- **La prima apertura continua a mostrare il Terminale**, di proposito: durante
  i minuti dell'installazione è l'unico posto dove si vede che il programma sta
  lavorando, e dove si legge l'errore se qualcosa va storto. Finita
  l'installazione la finestra nera si congeda e riapre l'applicazione.

### Aggiunto

- Endpoint `POST /api/esci` e pulsante **Chiudi lo Studio** nell'interfaccia.
  Senza Terminale non esiste più un `Ctrl+C`: la chiusura deve poterla chiedere
  l'interfaccia. Il server ascolta solo su `127.0.0.1`, quindi la richiesta può
  arrivare unicamente dalla stessa macchina.
- `A11Y_STUDIO_NO_OPEN=1`: il server non apre il browser predefinito quando è
  l'applicazione ad aprire la propria finestra. Senza questo si finiva con due
  finestre sullo stesso indirizzo.

### Corretto

- Il titolo dell'interfaccia era un `<p>`: la pagina non aveva alcun `h1`.
  Rilevato passando axe sullo Studio stesso — cosa che andava fatta prima, visto
  di che strumento si tratta. Ora è un `h1` e le violazioni sono zero.
- Il bordo del nuovo pulsante usava `--linea`, che sullo sfondo bianco sta a
  1.3:1. Un contorno di comando deve arrivare a 3:1 (WCAG 1.4.11): sostituito
  con un grigio a 3.03:1. `--linea` resta per separare, non per delimitare
  qualcosa su cui si clicca.

---

## [0.5.1] — 2026-09-16

Primo avvio sul Mac di un collega: `EACCES, permission denied` su
`~/.npm/_cacache`. L'installazione non è mai partita.

### Contesto

La cartella `~/.npm` di quell'utente appartiene a `root`: è quello che resta
quando, mesi o anni prima, qualcuno ha lanciato un `sudo npm install` per far
funzionare qualcos'altro. Da quel momento ogni `npm install` fatto da utente
normale fallisce, e non c'è modo che una persona non tecnica se ne accorga o vi
rimedi — la soluzione che si trova in rete è un `sudo chown -R`, cioè
esattamente ciò che questo pacchetto esiste per evitare.

Il punto generale: l'applicazione non può dipendere dallo stato delle cartelle
condivise di un Mac che non abbiamo mai visto.

### Corretto

- L'app usa una **cache npm propria**, dentro la cartella di lavoro
  (`npm_config_cache`), e scarica il browser di Playwright nello stesso posto
  (`PLAYWRIGHT_BROWSERS_PATH`). Niente più dipendenze da `~/.npm` e da
  `~/Library/Caches`. Come effetto collaterale, disinstallare torna a
  significare «cancella una cartella».
- Il messaggio d'errore dell'installazione non attribuisce più tutto alla rete:
  distingue i codici di rete da quelli di permesso e dice cosa fare in ciascun
  caso. La diagnosi sbagliata è costata al collega un tentativo e a noi un giro.

---

## [0.5.0] — 2026-09-16

La 0.4.4 aveva reso l'avvio quotidiano un doppio clic, ma la **prima**
installazione passava ancora dal Terminale. Per chi riceve lo strumento è la
parte che conta: è lì che si ferma.

### Contesto

Il vincolo vero non è il Terminale, è il canale di distribuzione. Un file che
passa dal caricamento web di GitHub viene registrato come non eseguibile, e lo
ZIP generato dal repository eredita quella proprietà: qualunque `.command` o
`.app` arrivi per quella strada nasce morto. Tenere l'installer e spiegare come
aggirarlo significa spostare il problema sull'utente.

### Aggiunto

- **`scripts/crea-pacchetto.sh`** e l'icona **`Prepara pacchetto`**: costruiscono
  `Studio accessibilita.app`, un'applicazione unica che contiene il codice del
  motore **e Node.js**, e che al primo avvio si installa da sola. Chi la riceve
  non deve procurarsi nulla.
- L'archivio è prodotto con `ditto`, che conserva i permessi di esecuzione, e va
  pubblicato come **allegato a una Release** di GitHub: le Release servono il
  file identico a come lo ricevono, a differenza dello ZIP del repository.
- L'app tiene i dati in `Documenti/Studio accessibilita` e riallinea il codice
  a ogni avvio: aggiornare significa sostituire l'applicazione, senza toccare le
  analisi già fatte.

### Modificato

- `INSTALLAZIONE.md` è ora la guida di chi **riceve** lo strumento: scarica,
  clic destro → Apri, attende. La strada dal codice sorgente è retrocessa ad
  appendice per chi lavora sul motore.

### Limiti accettati

- **Solo Mac con chip Apple.** Una build Intel raddoppierebbe il pacchetto e le
  cose da verificare a mano su macchine che non abbiamo. Lo script lo dice e si
  ferma invece di produrre un pacchetto che non parte.
- **Resta il clic destro → Apri alla prima apertura.** Eliminarlo richiede un
  account sviluppatore Apple e la notarizzazione: è una decisione di spesa, non
  tecnica.
- Il pacchetto va costruito su un Mac: non può essere prodotto dalla CI, che gira
  su Linux.

---

## [0.4.4] — 2026-09-16

Il primo collega a cui è stato passato lo strumento non è riuscito ad avviarlo.
Non per un bug del motore: per il bit di esecuzione.

### Contesto

Un file `.command` che arriva da un download — lo ZIP di GitHub, un
trasferimento, una copia — perde il permesso di esecuzione, e macOS risponde
*«non hai i privilegi di accesso adeguati»*. Nessuno sblocco dall'interfaccia lo
ripristina: non è Gatekeeper, è il bit `+x`. La strada del caricamento da web su
GitHub registra i file come non eseguibili, quindi il problema si ripresenta a
ogni download, e `chmod +x` eseguito dall'installazione non protegge la copia
successiva.

La conclusione è che un file `.command` non è un buon punto d'ingresso per chi
non usa il Terminale, per quanto bene sia scritto.

### Aggiunto

- `installa.command` costruisce a fine installazione **`Avvia Studio.app`**,
  un'applicazione compilata con `osacompile` sulla macchina dell'utente. Essendo
  generata in locale non è né scaricata né in quarantena: il doppio clic
  funziona, e continuerà a funzionare dopo ogni aggiornamento del codice.
  L'app apre una finestra di Terminale che esegue `bash avvia.command`, così il
  bit di esecuzione non serve nemmeno lì.
- L'installazione toglie la quarantena dai due `.command` e imposta comunque
  `+x` su `avvia.command`, come rete di sicurezza se `osacompile` non c'è.

### Modificato

- `INSTALLAZIONE.md`: il passo 2 non è più «doppio clic» ma la sequenza
  `bash` + trascina il file + Invio, spiegata con il motivo per cui serve. Il
  passo 3 punta all'icona. Aggiunte alla sezione problemi la voce sui privilegi
  di accesso e quella sulla cartella spostata (l'app ricorda il percorso
  assoluto deciso durante l'installazione).

### Nota sui limiti

L'app è legata alla posizione della cartella: se viene spostata, va rifatta
l'installazione. È un compromesso accettato — l'alternativa, cercare la cartella
a runtime, introduce ambiguità peggiori quando ne esistono due copie.

---

## [0.4.3] — 2026-09-16

La 0.4.2 ha reso la scansione di tef.tech dieci volte più veloce. Non era un
miglioramento: era il motore che guardava meno.

### Contesto

Escludendo la pagina che reindirizzava a Bocconi, il gruppo `/news/*` è
diventato **uniforme** — quella pagina estranea ne stava sporcando l'impronta
strutturale e costringeva il clustering a spezzarla in un cluster misto più tre
singoletti. Il clustering si è quindi corretto da solo: 8 template → 5, e
nessuna pagina persa dall'inventario (27 su 27 classificate).

Ma i campioni sono scesi da 12 a 7, e **sette tipi di difetto sono spariti** —
cinque dei quali stavano sulla sola `/news/369`, una pagina che non è più nel
campione. Nessuno di quei difetti era di Bocconi. Erano difetti veri di tef.tech
che il motore non ha più guardato.

### Modificato

- **Sotto le 40 pagine il campionamento si disattiva e si analizza tutto.** Il
  campionamento esiste per rendere abbordabile un sito grande: su 632 pagine, 92
  campioni fanno risparmiare ore. Su 27 pagine fa risparmiare un minuto e mezzo
  e costa sette tipi di difetto. Non è un compromesso, è una perdita secca.
- **I campioni crescono con la radice della dimensione del cluster**, non a
  passo fisso, con un tetto di 8. Un template che copre 268 pagine merita più
  attenzione di uno che ne copre due.

  Costo misurato su entrambi i siti reali prima di adottare la regola:
  hintogroup passa da 92 a 126 campioni, +37% di tempo di scansione; tef passa
  da 9 a 27, cioè l'intero sito. Entrambi i numeri sono il prezzo della
  copertura, ed è un prezzo che va pagato: lo strumento vale per quello che
  trova.

Entrambe le soglie sono in configurazione (`crawl.scanAllUnderPages`,
`crawl.maxSamplesPerTemplate`).

---

## [0.4.2] — 2026-09-16

Tre falsi positivi trovati guardando i risultati di una scansione vera, non
immaginati. Tutti e tre facevano la stessa cosa: attribuire al cliente qualcosa
che non era suo.

### Corretto

- **Pagine di altri siti finivano nel rapporto del cliente.** `page.goto` segue
  i reindirizzamenti in silenzio, e il motore registrava l'URL di PARTENZA
  misurando la pagina di ARRIVO. Su tef.tech un articolo rimandava al sito
  dell'Università Bocconi: **27 difetti altrui** sono finiti nel backlog del
  cliente, sotto un indirizzo del cliente. Un rapporto che fattura i problemi di
  qualcun altro non è sbagliato: è indifendibile davanti a chi deve correggerli.

  Ora, sia nella sonda del crawl sia nella scansione, l'URL di arrivo viene
  confrontato con quello richiesto: se il sito è un altro la pagina esce
  dall'audit e resta segnalata per quello che è, un collegamento che porta
  fuori. Il confronto ignora il solo prefisso `www.`; un sottodominio è un altro
  sito e richiede una decisione esplicita di chi configura.

- **Contrasto: falsi positivi causati da lightbox e finestre di dialogo.** axe
  restituisce `incomplete` quando non riesce a misurare, ma il MOTIVO cambia
  tutto e veniva buttato via. Su tef.tech, 14 segnalazioni su 29 erano
  `"could not be determined because it is overlapped by another element"`: il
  banner cookie di Iubenda e le slide di un carosello impedivano la misura. Non
  è un difetto del sito, ed è esattamente il genere di voce che fa perdere tempo
  a chi revisiona.

  Ora la sovrapposizione viene riconosciuta e scartata. Restano invece in coda
  `"contains an image node"` e `"due to a background gradient"`: lì il dubbio è
  vero e lo scioglie una persona guardando (440 evidenze su hintogroup.eu).

- **Percorsi di servizio esclusi dal crawl**: `/cdn-cgi/`, `/wp-json/`,
  `/wp-admin/`, `/xmlrpc.php`, `/.well-known/`. Il riconoscimento è per segmento
  di percorso, non per sottostringa.

### Modificato

- **Il designer vede un verdetto, non la diagnostica del motore.** La schermata
  Risultati mostrava l'autodiagnosi per intero: un designer che legge "il 64%
  delle pagine sta in cluster a struttura non uniforme" si ferma, e si ferma per
  niente. Ora c'è una riga sola — «Analisi sana: puoi procedere» oppure «Non
  costruire il documento per il cliente» — e il dettaglio tecnico sta dietro una
  piega, con scritto a chi è rivolto.
- **Cluster non uniformi ma coerenti scendono a nota.** Se ogni cluster misto
  appartiene a una sezione sola non c'è nulla di anomalo: è un sito editoriale.

---

## [0.4.1] — 2026-09-15

### Corretto

- **Il rilevamento del clustering collassato bloccava su un sito sano.** La
  regola riconosceva il collasso dalla sola quota di pagine nel cluster più
  grande, soglia 60%, tarata su un sito solo. Sul secondo sito reale — 28
  pagine, di cui 18 articoli di notizie — ha bloccato al 64%, e guardando i
  dati aveva torto: quel cluster era interamente `/news/`, cioè il
  raggruppamento corretto di un sito piccolo fatto quasi tutto di notizie.

  È lo stesso errore della versione precedente dello stesso controllo, e della
  regola sulle classi generate prima ancora: una soglia tarata su un campione,
  applicata a un mondo più vario. La quota non distingue le due situazioni,
  perché su un sito monotematico un template può legittimamente coprire i due
  terzi delle pagine.

  Il segnale giusto è l'**omogeneità** del cluster, non la sua dimensione:
  quando il clustering collassa, nello stesso bucket finiscono sezioni che non
  c'entrano nulla fra loro (`/it/blog`, `/it/eventi`, `/intranet`, `/webmail`
  insieme); quando funziona, il cluster grande appartiene a una sezione sola.
  Ora si blocca solo se il cluster maggiore copre più metà del sito **e**
  mescola almeno tre sezioni di primo livello — e mai sotto le 40 pagine, dove
  le percentuali sono rumore.

- **Percorsi di servizio esclusi dal crawl.** `/cdn-cgi/l/email-protection` —
  l'offuscamento delle email di Cloudflare, presente su qualunque sito dietro
  Cloudflare che pubblichi un indirizzo — era finito nel campione di un sito
  reale, sprecando una pagina su un 404 e creando un cluster spurio. Esclusi
  anche `/wp-json/`, `/wp-admin/`, `/xmlrpc.php`, `/.well-known/`. Il
  riconoscimento è per segmento di percorso, non per sottostringa: `/servizi/cdn`
  e `/blog/wp-json-spiegato` restano.

---

## [0.4.0] — 2026-09-15

Lo strumento smette di richiedere il terminale.

### Aggiunto

- **Studio** (`npm run studio`, oppure doppio clic su `avvia.command`): un
  server locale che apre un'interfaccia nel browser. Quattro fasi — progetti,
  analisi, revisione, risultati.

  Gira sul portatile di chi lavora, non su un server condiviso, per tre
  ragioni che non sono negoziabili: la scansione deve raggiungere il sito del
  cliente dalla rete di chi conduce l'audit, `consent-setup` apre una finestra
  su cui una persona clicca, e i risultati contengono contenuti dei clienti.
  Ascolta solo su 127.0.0.1.

  - **Progetti**: un form crea la configurazione senza scrivere JSON.
  - **Analisi**: giro di prova, analisi completa, ripresa, e l'accettazione
    manuale del banner dei cookie quando serve. Avanzamento e registro dal
    vivo.
  - **Revisione**: la coda dei finding che il motore non può decidere da solo,
    uno alla volta dal più grave, con l'immagine dell'elemento e quattro
    risposte chiuse. Il verdetto umano sovrascrive quello automatico — e solo
    in quel verso: il motore può dire "non lo so", una persona che ha guardato
    la pagina può dire tutto il resto.
  - **Risultati**: autodiagnosi in evidenza, numeri, link ai documenti.

- **L'interfaccia passa il proprio esame.** Sarebbe una barzelletta il
  contrario. Verificata con axe-core su tutte e quattro le schede, a vuoto e
  con i dati: **zero violazioni WCAG 2.1 AA**, 21-27 regole superate per
  schermata, percorso da tastiera completo. Schede secondo il pattern ARIA,
  landmark veri, focus sempre visibile, contrasti oltre 4.5:1.

### Corretto

- **L'immagine mancante ora si dichiara.** Stesso difetto di percorso corretto
  nella 0.3.3 per la dashboard: se il file dello screenshot non si trova, la
  scheda di revisione lo dice invece di mostrare uno spazio vuoto. Un revisore
  che non vede l'elemento non ha modo di sapere se manca la foto o manca il
  problema.

---

## [0.3.4] — 2026-09-15

### Aggiunto

- **Griglia di confronto per la validazione umana**
  (`scripts/griglia-confronto.mjs`, `npm run griglia`). Genera da un `run.json`
  un foglio in quattro parti: istruzioni, analisi in cieco del revisore,
  confronto riga per riga sui problemi prodotti dal motore, esito calcolato.

  La struttura serve a proteggere il dato piu' fragile. Se il revisore legge
  prima il backlog del motore e poi guarda il sito, non confronta: verifica una
  lista, e trova quasi solo cio' che c'e' scritto. I problemi che il motore NON
  vede — la misura piu' importante di tutte — sparirebbero. Quindi l'analisi
  manuale si compila prima, su un foglio separato, e solo dopo si apre il
  confronto.

  Le formule del foglio "Esito" sono verificate: compilato con venti verdetti
  noti, restituisce i conteggi attesi e i tassi corretti.

---

## [0.3.3] — 2026-09-15

### Corretto

- **Le evidenze visive c'erano ma non si vedevano.** Gli screenshot venivano
  catturati (630 ritagli) e incorporati nella dashboard (37 problemi su 76), ma
  l'immagine compariva nuda fra due paragrafi, senza titolo e senza dire da
  quale pagina venisse: su un rapporto vero non e' stata notata. Ora ha il suo
  titolo "Evidenza visiva", la pagina di provenienza come link e il selettore
  dell'elemento. Dove lo screenshot non c'e', il rapporto lo dice e spiega
  perche' (tetto per pagina, oppure difetti che in un fermo immagine non si
  vedono: contrasto al passaggio, ordine di tabulazione, reflow).
- **Il rapporto perdeva le immagini in silenzio.** I percorsi degli screenshot
  sono relativi alla cartella da cui girava la scansione: rigenerando il
  rapporto da un'altra posizione le immagini sparivano senza un errore, e il
  documento sembrava semplicemente un documento senza evidenze visive. E'
  successo davvero, su un file consegnato. Ora il percorso viene cercato su piu'
  basi e, se i file mancano, il comando lo dice in chiaro:
  `evidenze visive: N problemi su M — ATTENZIONE: X screenshot registrati ma
  non trovati`.

### Aggiunto

- **Campionamento ridotto per le varianti linguistiche.** La stessa pagina in
  italiano e in inglese ha la stessa struttura: misurarla due volte per intero
  e' lavoro duplicato. La lingua prevalente mantiene il campionamento pieno, le
  traduzioni scendono a un controllo a campione — non si saltano, perche' un
  `alt` non tradotto o un `lang` sbagliato vivono solo li'.
  L'appaiamento usa `link rel="alternate" hreflang`, che la pagina dichiara da
  se': e' l'unico modo di riconoscere gli slug tradotti (`/it/eventi` e
  `/en/events`), che la sola forma dell'URL non appaia. Ripiego sulla forma del
  percorso quando hreflang non c'e'.
  `test/language.test.mts` fissa i cinque casi reali, compresi i due errori che
  il codice ha commesso sui dati veri: due template della stessa lingua
  scambiati per traduzioni, e un template italiano declassato per transitivita'
  perche' imparentato con uno inglese.

---

## [0.3.2] — 2026-09-15

Costo di un errore, non velocita' di punta. Su un sito grande il rischio non e'
che la scansione sia lenta: e' che vada persa.

### Aggiunto

- **Ripresa di una scansione interrotta.** Ogni pagina misurata viene scritta
  su disco appena prodotta (`scansione-parziale.jsonl`, una riga per pagina).
  Una scansione interrotta a tre quarti — disconnessione, portatile chiuso,
  timeout del sito — riprende dalla pagina successiva invece di ricominciare.
  Il file viene cancellato solo a scansione completata.
  `test/resume.test.mts` verifica la sola proprieta' che rende accettabile il
  meccanismo: interrompe davvero, troncando il file a meta' riga come farebbe
  un processo ucciso mentre scrive, riprende, e pretende evidenze identiche a
  una scansione ininterrotta. Compreso il passaggio "a freddo" per l'audit del
  banner di consenso, che non deve essere ne' saltato ne' ripetuto.
- **`audit --smoke`**: giro di prova su campione ridotto, stessi percorsi di
  codice e stessa autodiagnosi, in pochi minuti. Serve a sapere se l'analisi e'
  sana prima di pagare la scansione intera. Scrive in una cartella separata.
- **`audit --reuse-crawl`**: riusa la scoperta URL gia' fatta. Il crawl dipende
  dal sito, non da come lo analizziamo; su un ecosistema di migliaia di URL e'
  una fetta consistente del tempo. Esplicito e non automatico, perche' una
  scoperta vecchia di settimane non descrive piu' il sito.

### Modificato

- **La catena di antenati viene raccolta anche per gli elementi di terze
  parti**, e il fornitore si puo' dedurre in Node (`CHAIN_VENDORS`). Aggiungere
  un fornitore all'elenco non impone piu' di rifare le scansioni: si applica
  con `replay`. L'elenco e' per forza incompleto — Google Maps incorporata via
  JS API e' costata una scansione — quindi questa categoria di rilancio andava
  chiusa.

---

## [0.3.1] — 2026-09-15

Prima versione corretta interamente sui dati di una scansione gia' eseguita,
senza chiederne un'altra. Il ciclo di feedback della 0.3.0 ha funzionato: ha
mostrato che due correzioni precedenti non funzionavano affatto.

### Corretto

- **Il riconoscimento delle classi generate era tarato su un solo sito.** La
  regola pretendeva almeno due maiuscole interne. Gli hash di styled-components
  del secondo sito reale — `jxpyrS`, `cbrjlW`, `ekxyAo`, `kKfmzi` e altri
  cinque — ne hanno una sola: la regola non ne scartava nemmeno uno, e il
  ricalcolo cambiava zero firme su 2407 evidenze. Ora valgono tre segnali
  misurati su quel campione: una maiuscola interna, assenza di vocali
  (`crhcdd`, `mhbfv`), letterali di errore (`false` finito nell'attributo
  class). Separano perfettamente le 13 classi generate dalle 7 scritte a mano.
- **Il rilevatore di duplicati gridava al lupo.** Assumeva che due componenti
  distinti non producano mai lo stesso numero di occorrenze. Falso: tutto cio'
  che sta nell'header compare su ogni pagina, quindi cinque componenti diversi
  risultavano tutti a 628 occorrenze. Dei nove gruppi segnalati, sei erano
  coincidenze. Ora un duplicato richiede stessa sequenza di tag e differenza
  confinata a un identificatore non strutturale: 4 gruppi, tutti reali.
- **Gli id generati dal CMS spezzavano la deduplica.** `describe` preferisce
  l'id alla classe, e i CMS costruiscono gli id dal titolo della sezione
  (`#section-accordion-il_potere_del_come`, su 1 pagina di 88). La versione
  inglese di una pagina risultava un problema diverso dall'italiana. Ora gli id
  hanno un registro di frequenza come le classi: valgono come identita' solo
  sopra il 30% delle pagine sondate — soglia che tiene `#uw-skip-to-main`
  (58/88) e scarta `#sezione-lista-eventi` (2/88).
- **Le mappe Google incorporate via JS API** non sono un iframe ma un albero di
  `div.gm-style` dentro la pagina: i loro difetti finivano attribuiti al
  front-end del cliente invece che a Google.
- **`link-in-text-block`** aveva titolo e descrizione ancora in inglese nei
  documenti destinati al cliente.

### Modificato

- **Cluster a struttura non uniforme: non e' piu' un bloccante.** Bloccava
  all'81% su un sito editoriale dove i dieci cluster misti erano il
  raggruppamento corretto (`/it/blog/*`, `/en/eventi/*`, ...), marcati non
  uniformi perche' il corpo di un articolo varia davvero. Ora blocca solo la
  patologia vera — un singolo cluster che supera il 60% delle pagine, cioe' il
  clustering collassato — e altrimenti segnala il costo reale, che e' il
  campionamento piu' fitto.

### Aggiunto

- `test/identity.test.mts`: i casi reali osservati in produzione, classi e id,
  come test di regressione. La funzione che decide l'identita' e' stata
  sbagliata tre volte; questi casi sono il modo di non ripeterlo.

---

## [0.3.0] — 2026-09-15

Meccanismi di feedback. Le tre correzioni precedenti hanno richiesto tre
scansioni reali all'utente, una per volta: un costo non accettabile, causato da
un ciclo di validazione rotto alla radice.

### Aggiunto

- **Autodiagnosi a ogni scansione** (`src/analyze/selfCheck.ts`). Il motore
  cerca le patologie note della propria analisi e le dichiara: finding
  duplicati, classi con aspetto di hash nelle firme, quota di pagine in cluster
  non uniformi, controlli frammentati, pagine perse, testi non tradotti. Se
  trova un problema bloccante dice esplicitamente che i risultati non sono
  pronti per il cliente. L'esito finisce anche in `run.json`.
- **`a11y replay`**: riesegue firme, deduplica e testi su una scansione già
  salvata e mostra il diff. Valida una correzione in secondi sui dati reali,
  senza rete e senza carico sul sito del cliente.
- **Invariante anti-duplicati** nella suite di regressione.
- **`a11y replay` funziona anche sulle scansioni anteriori alla 0.3.0**
  (`rederiveFromComposed`). Non avendo il materiale grezzo, ricostruisce la
  firma da quella già composta. Le regole nuove sono strettamente più
  restrittive delle vecchie — scartano classi in più e collassano contenitori in
  più, non ne recuperano nessuno — quindi il risultato coincide con quello che
  si otterrebbe rilanciando la scansione. La proprietà è verificata in
  `test/rederive.test.mts` su dati veri: su 185 evidenze con firma diversa fra
  le due versioni, il ricalcolo riproduce la firma corretta in tutti i casi.
  Conseguenza pratica: **una scansione già eseguita non va rifatta** per
  incassare una correzione alla logica di firma.

### Modificato

- **La firma del componente si calcola in Node, non nel browser.** L'evidenza
  conserva la catena di antenati grezza (`signatureInput`) e la composizione
  avviene in `src/core/signature.ts`, una funzione pura. Era la funzione più
  soggetta a bug del motore ed era anche l'unica non testabile offline.

### Note

L'autodiagnosi si è ripagata al primo avvio: ha trovato due duplicati sul sito
di prova classico che nessuno aveva notato, e ha mostrato che il rilevatore era
troppo aggressivo — un `input` e un `textarea` non sono lo stesso componente.
Ora un duplicato conta solo se elemento finale e landmark coincidono.

---

## [0.2.2] — 2026-09-15

Terza iterazione sull'identità dei componenti, l'ultima necessaria: la prima
aveva corretto la teoria, la seconda il filtro, questa chiude le due cause
residue dei finding duplicati.

### Corretto

- **Gli hash del guscio condiviso superavano la soglia di frequenza.** Le classi
  generate di header, footer e form di iscrizione compaiono su *ogni* pagina,
  quindi passavano qualunque soglia statistica. Ora una classe senza separatori
  con due o più maiuscole interne è considerata generata a prescindere dalla
  frequenza: le classi scritte a mano sono in pratica sempre tutte minuscole
  (`container`) o camelCase con una sola maiuscola (`mainNav`), mentre gli hash
  ne hanno tre o quattro sparse (`ciSEfC`, `bLurJE`, `iOgZpB`). Verificato sui
  dati reali: 25 delle 38 classi presenti nelle firme vengono eliminate, tutte
  quelle coinvolte nei duplicati; restano le legittime (`mx-auto`,
  `menu-item__label`, `body-dynamic-content`, `title-second`).
- **I wrapper anonimi entravano nella firma.** Lo stesso campo compariva come
  `form > div > div > input` su una pagina e `form > div > div > div > input`
  su un'altra: due firme, due voci identiche nel backlog con lo stesso
  conteggio di occorrenze. Un `div` senza classi utili, senza id e senza ruolo
  non identifica nulla: ora viene saltato. Contano il landmark, gli antenati
  con un'identità vera, e l'elemento stesso.

---

## [0.2.1] — 2026-09-15

Seconda scansione di hintogroup.eu. Il banner viene chiuso, le terze parti sono
attribuite, il clustering riconosce le sezioni del sito. Restava però una coda
di finding duplicati.

### Corretto

- **Il filtro sulle classi generate lasciava passare otto hash su dieci.** Due
  cause: gli hash tutti minuscoli (`jfoksu`) non hanno cambi di maiuscola, e il
  conteggio con regex globale ne perdeva metà perché le corrispondenze non si
  sovrappongono (`ekxyAo` ne contava uno invece di due). Conseguenza: lo stesso
  componente produceva firme diverse e il backlog conteneva coppie di finding
  identici con lo stesso conteggio di occorrenze.

  Il giudizio a vista è stato abbandonato: una parola vera (`container`) e un
  hash (`jfoksu`) sono indistinguibili per forma. Ora le classi **senza
  separatori** devono comparire su almeno il 40% delle pagine sondate per
  entrare nelle firme; quelle con separatori (Tailwind, BEM, classi dei CMS) su
  almeno due. Il registro di frequenza è diventato autoritativo anche nel
  browser, dove prima il filtro sintattico poteva scartare classi che Node
  aveva accettato.

---

## [0.2.0] — 2026-09-15

Prima prova su un sito in produzione, e le correzioni che ne sono seguite. La
meccanica aveva retto; l'identità dei componenti no.

### Aggiunto

- **Identità stabile dei componenti** (`src/core/identity.ts`). La stabilità di
  una classe CSS si decide per frequenza fra pagine, non per aspetto, con catena
  di ripiego fino al percorso strutturale puro. Risolve il fallimento su
  applicazioni con CSS-in-JS.
- **Gestione dei banner di consenso** (`src/scan/consent.ts`): riconoscimento di
  undici piattaforme, euristica sul testo italiano e inglese, override in
  configurazione, diagnostica assistita con i candidati cliccabili.
- **Comando `a11y consent-setup`**: browser visibile per accettazione manuale
  una tantum, con salvataggio dello stato. Abilita anche la scansione delle aree
  autenticate.
- **Attribuzione dei componenti di terze parti**: sedici fornitori riconosciuti
  (reCAPTCHA, UserWay, chat, mappe, video). Responsabile `fornitore-terzo`.
- **Innesco dei contenuti differiti**: la pagina viene scorsa prima dell'analisi,
  altrimenti il contenuto lazy non viene visto affatto.
- **Secondo sito di prova** (`fixtures/build-react.mjs`) che imita
  un'applicazione React con CSS-in-JS, widget di terze parti e banner custom.
- **Suite di regressione** (`npm run verify`): quindici invarianti verificate su
  entrambi i fixture, eseguita in CI a ogni push.
- **Registro delle decisioni** (`docs/decisioni.md`).

### Modificato

- Il riconoscimento delle collezioni di URL richiede ora un'alta percentuale di
  figli foglia e tratta la radice a parte. Senza questo, due pagine 404 bastavano
  a collassare il clustering dell'intero sito.
- Le osservazioni di axe-core sono tradotte in italiano dai dati strutturati,
  con il testo originale conservato per tracciabilità.
- Le etichette dei template privilegiano il percorso dell'URL quando la forma
  non identifica il tipo di contenuto.
- Il punteggio di severità è stato ritarato: la versione precedente classificava
  come critica l'83% dei finding, il che non ordina nulla.

### Corretto

- Il percorso da tastiera saltava gli elementi con `tabindex` positivo, perché
  il reset del focus alterava l'ordine di tabulazione. Stessa causa nella sonda
  sulla raggiungibilità del banner, ora statica.
- Un banner di consenso non chiudibile non inquina più i risultati: la pagina
  viene esclusa con motivazione esplicita.
- Nelle osservazioni non compare più `undefined` quando axe non riesce a
  misurare il contrasto.
- Il contrasto in hover non produce più falsi positivi su testo sovrapposto a
  immagini o gradienti.
- Gli id generati da React (`:r0:`) non rompono più i selettori CSS.
- Le pagine che rispondono 4xx/5xx sono escluse e segnalate come collegamenti
  rotti, invece di generare finding privi di significato.

---

## [0.1.0] — 2026-09-15

Primo motore funzionante end-to-end, verificato su un sito di prova costruito
con difetti reali.

### Aggiunto

- Discovery via sitemap e crawl a link; clustering per template con
  campionamento rappresentativo.
- Scansione con axe-core più i check che axe non copre: percorso da tastiera,
  contrasto sugli stati, reflow a 320px, spaziatura del testo, inventario alt
  text e link, struttura dei form.
- Catalogo dei cinquanta criteri WCAG 2.1 A/AA in italiano, con classificazione
  di automatizzabilità e spiegazioni in linguaggio piano.
- Deduplica per componente e punteggio di severità.
- Porta AI con contratto stabile e due adapter (manuale e API), con tetto ai
  verdetti applicato nel codice.
- Dashboard HTML navigabile e backlog Excel su cinque fogli.
