# Registro delle decisioni

Perché il motore è fatto così. Ogni voce è una scelta che ha alternative
plausibili: se in futuro qualcuno vuole cambiarla, qui trova il motivo per cui
è stata presa e cosa si romperebbe.

Diverse di queste decisioni sono state **pagate con un bug vero**. Sono
segnalate, perché una lezione imparata sul campo vale più di una preferenza.

---

## 1. L'unità di analisi è il componente dentro un template, non la pagina

**Contesto.** Un ecosistema come quello di un ateneo ha decine di migliaia di
URL e un budget di consulenza da poche decine di giornate. Auditare pagine è
economicamente impossibile, e produce un backlog che nessuno può lavorare.

**Decisione.** Le pagine vengono raggruppate per template (firma strutturale) e
si scansiona un campione per template. I difetti vengono deduplicati per
componente: un header rotto condiviso da quindici siti è *un* problema.

**Conseguenze.** Il backlog consegnato elenca cose da sistemare nel tema, non
occorrenze. Il numero di occorrenze è una stima estrapolata sul numero di pagine
del cluster, e va presentato come tale. In cambio, il motore non vede i difetti
che esistono su una pagina sola non campionata: è un compromesso accettato, e il
campionamento va dichiarato al cliente.

---

## 2. Il tetto al verdetto automatico vive nel codice, non nel prompt

**Contesto.** Circa metà dei criteri WCAG non è verificabile da una macchina.
Dichiarare conformità o non conformità su quei criteri rende il rapporto
contestabile dal fornitore che deve correggere.

**Decisione.** Ogni criterio del catalogo porta un campo `automation`
(`deterministic` / `partial` / `judgment`). Nessun automatismo — né i check, né
il layer AI — può emettere `fail` su un criterio non deterministico: il massimo
è `needs-review`. Il controllo è applicato in `applyTriage`, a valle del
modello, ed è **ridondante rispetto al prompt di proposito**: un prompt si può
modificare per sbaglio, un modello può sbagliare, il vincolo normativo no.

**Conseguenze.** La coda `needs-review` è grande, e va presentata come lavoro
previsto invece che come incertezza dello strumento. Coperto da
`test/triage-cap.test.mts`.

---

## 3. Il trasporto verso il modello è un dettaglio di implementazione

**Contesto.** In fase di calibrazione serve leggere prompt e risposte a mano; in
produzione serve automazione. Sono due esigenze opposte nello stesso progetto.

**Decisione.** Una porta con contratto fissato e validato a runtime:
`EvidencePack` → `TriageResult`. Due adapter con la stessa interfaccia
(`manual`, `anthropic`). I pacchetti hanno dimensione fissa proprio perché il
batching non cambi quando cambia il trasporto.

**Conseguenze.** Il passaggio fra i due è una riga di configurazione. Lo stesso
schema reggerà una futura UI di revisione senza modifiche a monte.

---

## 4. L'identità di un componente non può poggiare sui nomi delle classi

> Pagata con un bug. Prima prova su un sito reale, settembre 2026.

**Contesto.** La firma del componente è la chiave su cui il motore decide se due
difetti sono lo stesso problema. La prima versione la costruiva dalle classi
CSS, filtrando gli hash esadecimali. Funzionava perfettamente sul sito di prova,
che usava classi semantiche scritte a mano.

Al primo sito reale — applicazione React con CSS-in-JS — **108 classi su 128
erano hash generati**, alfanumerici e quindi invisibili al filtro. Conseguenze a
cascata: la deduplica produceva 11 finding per un problema solo; il clustering
mandava 617 pagine su 632 nel cestino dei gruppi eterogenei; e il confronto fra
scansioni successive sarebbe stato impossibile, perché quei nomi cambiano a ogni
build.

**Decisione.** La stabilità di una classe si decide per **frequenza fra pagine**,
non per aspetto: si sondano più pagine, si costruisce un registro, e una classe
che compare su una pagina sola è generata. Il filtro sintattico resta come primo
sbarramento a basso costo. Sopra c'è una catena di ripiego: attributi `data-*`,
poi id non generato, poi classe validata, poi **percorso strutturale puro** con
tag e ruoli ARIA.

**Conseguenze.** Su un'applicazione senza classi utili il clustering è più
grossolano: due template diversi con lo stesso scheletro possono collidere. È un
compromesso onesto, molto meglio dell'alternativa, che era non raggruppare
nulla. Il campo `generatedClassRatio` nel run diagnostica quanto un sito sia
ostile all'analisi strutturale.

**Presidio.** `fixtures/build-react.mjs` riproduce quel mondo. Il fixture
originale non poteva far emergere il difetto, perché era costruito sulle stesse
assunzioni del motore: **un sito di prova che conferma le proprie ipotesi non è
un test**.

---

## 5. Un banner di consenso non chiudibile invalida la pagina

> Pagata con un bug. Stessa prova.

**Contesto.** Il banner era fatto in casa, il motore non è riuscito a chiuderlo,
ha emesso una nota di gravità media e ha proseguito su tutte e 39 le pagine.
Risultato: contrasti falsati dall'overlay, ordine di focus catturato, screenshot
coperti — e nessun segnale a chi leggeva il rapporto.

**Decisione.** Se il banner non si chiude, la pagina **esce dai risultati** con
una motivazione esplicita. Meglio nessun dato che dati falsi. Il motore elenca
inoltre i candidati cliccabili trovati dentro il banner, così chi rivede copia
un selettore invece di aprire DevTools.

La scala di ripieghi, dal più automatico al più assistito: piattaforma nota →
euristica sul testo → override in configurazione → diagnostica assistita →
`a11y consent-setup` (browser visibile, accettazione manuale una tantum, stato
salvato) → fallimento esplicito.

**Conseguenze.** `consent-setup` risolve gratuitamente anche le **aree
autenticate**: chi fa il login durante quella sessione abilita le scansioni
successive sulle pagine riservate.

Il banner viene comunque **auditato prima di essere chiuso**, come componente a
sé: è la prima barriera che incontra un utente e spesso la più grave. Per questo
la prima pagina di ogni scansione viene visitata "a freddo", senza stato salvato.

---

## 6. I componenti di terze parti sono attribuiti al fornitore

> Pagata con un bug. Stessa prova.

**Contesto.** Sul primo sito reale il terzo finding per punteggio — *indicatore
di focus rimosso, 629 occorrenze stimate* — era interamente il badge reCAPTCHA
di Google. Un rapporto che fattura la segnalazione di un iframe di Google perde
credibilità davanti al fornitore che deve correggere.

**Decisione.** Sedici componenti noti (reCAPTCHA, UserWay, AccessiBe, chat,
mappe, video, form esterni) vengono riconosciuti e la loro firma collassa sul
fornitore. Restano nel rapporto — l'utente li incontra davvero, e la
responsabilità verso di lui resta di chi pubblica il sito — ma con responsabile
`fornitore-terzo` e il nome del fornitore nel titolo.

---

## 7. Una sonda diagnostica non deve alterare ciò che verrà misurato

> Pagata con due bug distinti, a poche ore di distanza.

**Contesto.** Due volte lo stesso errore, in punti diversi. La prima: per
azzerare il focus prima del percorso da tastiera, il motore metteva
`tabindex="-1"` sul `body` e lo focalizzava — e così facendo Chromium salta
tutti gli elementi con `tabindex` positivo, che nell'ordine reale vengono per
primi. La seconda: la sonda che verificava se il banner fosse raggiungibile da
tastiera premeva Tab dodici volte, spostando il punto di partenza della
navigazione sequenziale a metà pagina; il percorso misurato subito dopo partiva
monco, quattro fermate invece di sedici.

In entrambi i casi il risultato era **plausibile ma sbagliato**, e nessun errore
veniva sollevato.

**Decisione.** Le sonde diagnostiche sono statiche dove possibile (il controllo
sulla raggiungibilità del banner interroga il DOM, non preme tasti). Dove serve
muovere il focus, si usa `blur()` senza manipolare `tabindex`, e la misura vera
viene per prima.

**Conseguenze.** Il controllo statico non dimostra la raggiungibilità in
presenza di trappole del focus altrove: il limite è dichiarato nel codice e quei
casi restano in coda di revisione.

---

## 8. WCAG 2.1 AA è la baseline vincolante; 2.2 è raccomandazione

**Contesto.** Le Linee Guida AgID rimandano alla norma armonizzata EN 301 549,
che a oggi referenzia WCAG 2.1. I criteri introdotti da WCAG 2.2 non sono
vincolanti finché la Commissione non aggiorna la norma.

**Decisione.** I criteri 2.2 sono raccolti a parte (`WCAG22_ADDITIONS`) e
riportati come raccomandazione forward-looking, mai come non conformità. Nel
report sono segnalati con bordo tratteggiato.

**Conseguenze.** Da rivedere quando la norma armonizzata verrà aggiornata: a
quel punto basta spostare i criteri fra i due elenchi.

---

## 9. I siti di prova sono la suite di regressione

**Contesto.** Due regressioni vere in una sola giornata, entrambe silenziose —
si manifestavano come "meno risultati", non come errori. Una l'hanno causata due
pagine 404 che facevano scattare male la regola di riconoscimento delle
collezioni di URL, collassando il clustering dell'intero sito.

**Decisione.** `npm run verify` costruisce entrambi i fixture, li serve, esegue
le due scansioni complete e verifica quindici invarianti, fra cui che tutti i
difetti piantati siano rilevati e che nessun testo destinato al cliente contenga
segnaposto non risolti o frasi rimaste in inglese. Gira in CI a ogni push.

**Conseguenze.** Chi aggiunge un check aggiunge anche il difetto corrispondente
nel fixture. Chi vede calare il numero di difetti rilevati ha una regressione,
non un miglioramento della precisione.

---

## 11. Il motore deve riconoscere le proprie patologie

> Pagata con tre scansioni reali chieste all'utente per validare tre correzioni
> alla stessa funzione.

**Contesto.** I difetti dell'analisi non sollevano errori. Finding duplicati,
firme instabili, cluster che inghiottono metà sito: il numero in fondo alla
scansione sembra sensato e il problema si scopre solo leggendo il backlog a
mano. Ogni scoperta costava una scansione nuova — crawl, browser, minuti di
attesa e carico sul sito del cliente.

Il ciclo di feedback era rotto in modo strutturale: ogni correzione veniva
validata su dati sintetici costruiti da chi scriveva il codice, e il test
costoso sui dati veri lo pagava l'utente.

**Decisione.** Tre meccanismi, che si rinforzano a vicenda.

*L'autodiagnosi* (`src/analyze/selfCheck.ts`) gira a ogni scansione e cerca le
patologie note dell'analisi: finding con stesso titolo, stesse occorrenze e
stesso elemento finale; classi con aspetto di hash rimaste nelle firme; quota di
pagine in cluster non uniformi; controlli che si frammentano su troppi finding;
testi non tradotti nei documenti destinati al cliente. Se trova un problema
bloccante lo dichiara: *i risultati non sono pronti per il cliente*.

*La firma calcolata in Node* (decisione 4, ma qui per una ragione diversa):
finché viveva nel browser, verificarne una modifica richiedeva una scansione
vera. Ora il browser raccoglie la catena di antenati grezza, la firma la compone
una funzione pura, e una correzione si testa in millisecondi.

*Il replay* (`a11y replay`) riesegue firme, deduplica e testi su una scansione
già salvata e mostra il diff. Una correzione si valida sui dati reali del
cliente senza toccare la rete.

**Conseguenze.** La regola operativa che ne discende: **non si chiede mai una
nuova scansione per validare una correzione che il replay può verificare.** Una
scansione nuova serve solo quando cambia qualcosa che si misura nel browser — un
check, il crawl, la gestione del consenso — e in quel caso le correzioni si
accumulano in un giro solo.

L'autodiagnosi ha ripagato il costo immediatamente: al primo avvio ha trovato
due duplicati sul sito di prova classico che nessuno aveva notato, e ha rivelato
che il rilevatore stesso era troppo aggressivo — un `input` e un `textarea` non
sono lo stesso componente. Un controllo che grida al lupo insegna a ignorarlo,
quindi ora un duplicato conta solo se elemento finale e landmark coincidono.

---

## 10. axe-core è una dipendenza, non un sorgente da modificare

**Contesto.** axe-core è distribuito sotto MPL-2.0, che impone la pubblicazione
delle modifiche ai suoi file sorgente.

**Decisione.** axe-core viene usato come dipendenza, mai modificato. Le
integrazioni (traduzione italiana delle osservazioni, mappatura sui criteri,
arricchimento con la firma del componente) vivono in file nostri.

**Conseguenze.** Nessun obbligo di apertura ricade su questo motore. Vedi
`NOTICE.md`. Se in futuro servisse modificare una regola di axe, la strada
corretta è una regola custom registrata via `axe.configure`, non una patch ai
sorgenti.


---

## 12. Una scansione già eseguita non si rifà

**Contesto.** La 0.3.0 sposta il calcolo della firma in Node e conserva il
materiale grezzo, così che `replay` possa validare le correzioni senza rete. Ma
le scansioni fatte *prima* di quella versione quel materiale non ce l'hanno: la
firma era composta dentro la pagina e la catena di antenati veniva buttata via.

La conseguenza sarebbe stata dire all'utente, per la quarta volta, «rilancia».
Con in mezzo un dettaglio che rende la richiesta indifendibile: mentre scrivevo
il meccanismo che doveva evitare i rilanci, una scansione era in corso sul suo
portatile, ed era già la terza.

**Decisione.** `replay` ricalcola anche le scansioni vecchie, ricostruendo la
firma da quella già composta invece che dalla catena grezza
(`rederiveFromComposed`). È lecito per una ragione precisa e verificabile: le
regole di stabilità nuove sono **strettamente più restrittive** delle vecchie.
Scartano classi in più e collassano contenitori in più; non ne riammettono
nessuno. Un'operazione solo sottrattiva si può applicare alla stringa composta
ottenendo lo stesso risultato che si otterrebbe applicandola alla catena.

**Conseguenze.** La condizione va sorvegliata, non data per acquisita: se una
regola futura dovesse *riammettere* qualcosa che prima veniva scartato, questa
scorciatoia smetterebbe di essere valida e servirebbe il materiale grezzo. Per
questo la proprietà è un test e non un commento: `test/rederive.test.mts` prende
una scansione 0.3.0, ricompone la firma che avrebbe prodotto la 0.2.2, la
ricalcola e pretende di riottenere quella corretta. Su 185 evidenze reali con
firma diversa fra le due versioni, la riproduce in tutti i casi. Il giorno in
cui una regola violasse la condizione, il test fallirebbe qui — non nel backlog
consegnato al cliente.

**Regola operativa, rafforzata.** Prima di chiedere una scansione, si verifica
se esiste già un `run.json` su cui la correzione si possa validare. La risposta
è quasi sempre sì.


---

## 13. Le euristiche si tarano su piu' di un sito, e si misurano

**Contesto.** Il riconoscimento delle classi generate e' stato sbagliato tre
volte di fila. Ogni versione era tarata sugli hash dell'ultimo sito visto: prima
i pattern noti dei generatori, poi due maiuscole interne. Sul sito successivo
gli hash avevano una maiuscola sola e la regola non ne scartava nemmeno uno.

Stessa forma di errore, altro controllo: il rilevatore di duplicati assumeva che
due componenti distinti non producano mai lo stesso numero di occorrenze.
Sembrava ovvio. Su un sito vero e' falso — tutto cio' che sta nell'header
compare su ogni pagina, quindi il conteggio misura le pagine, non il componente.
Sei segnalazioni su nove erano coincidenze. E il controllo sui cluster misti
bloccava all'81% su un sito editoriale dove il clustering aveva ragione.

Tre controlli, un unico difetto: un'euristica plausibile, mai misurata contro i
dati che pretendeva di descrivere.

**Decisione.** Un'euristica entra nel motore solo se accompagnata da (1) il
campione reale su cui e' stata tarata, riportato per esteso nel commento, e (2)
un test di regressione che contiene quel campione, positivi e negativi insieme.
`test/identity.test.mts` elenca le venti classi senza separatori osservate su
hintogroup.eu e pretende che le tredici generate vengano scartate e le sette
scritte a mano sopravvivano.

**Conseguenze.** Il commento smette di essere una spiegazione e diventa la prova
del perche' la soglia e' quella. Quando il terzo sito rompera' di nuovo la
regola — succedera' — il campione nuovo si aggiunge al test invece di sostituire
la regola vecchia, e non si puo' correggere il caso nuovo rompendo quelli gia'
visti.

**Corollario sulla severita'.** Un controllo che segnala una condizione normale
come bloccante non e' prudente, e' dannoso: insegna a ignorare l'autodiagnosi, e
un'autodiagnosi ignorata non vale niente. Prima di marcare qualcosa bloccante si
guarda cosa produce su un sito sano.
