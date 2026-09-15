# Hinto A11y Engine

Motore di audit di accessibilità per ecosistemi digitali multi-sito.
Standard di riferimento: **WCAG 2.1 AA / EN 301 549 v3.2.1**.

Stato: **POC funzionante end-to-end**, verificato su due siti di prova e corretto dopo la prima prova su un sito reale.

---

## L'idea in una riga

L'unità di analisi non è la pagina, è il **componente dentro un template**. Un header rotto condiviso da quindici siti è *un* problema, non quindicimila occorrenze. È questa scelta che rende sostenibile auditare un ecosistema da decine di migliaia di URL con il budget di un progetto di consulenza.

## Cosa fa e cosa non fa

Il motore raccoglie evidenze e le organizza. **Non dichiara conformità** sui criteri che richiedono giudizio umano: il tetto al verdetto automatico è fissato nel codice a partire dalla natura del criterio WCAG, e vale anche se il prompt viene modificato o il modello sbaglia (`applyTriage` in `src/analyze/aiPort.ts`, con test dedicato). Circa metà dei criteri WCAG non è verificabile da una macchina, e un rapporto che fingesse il contrario sarebbe contestabile dal fornitore che deve correggere.

## Licenze delle dipendenze

| Componente | Licenza | Implicazioni |
|---|---|---|
| axe-core | MPL-2.0 | Uso commerciale libero. Obbligo di pubblicazione solo se si modificano i sorgenti di axe-core: qui è usato come dipendenza, quindi nessun obbligo. |
| Playwright | MIT | Nessun vincolo. |
| exceljs, zod, commander, p-limit | MIT | Nessun vincolo. |

Nessun costo di licenza, nessun vincolo di apertura sul codice di questo motore.

---

## Avvio rapido

```bash
npm install
cp config.example.json config.mio-cliente.json   # poi editare
npx tsx src/cli/index.ts audit config.mio-cliente.json
```

Output in `out/`: `dashboard.html`, `backlog.xlsx`, `run.json` (stato completo), `screenshots/`.

In ambienti con Chromium preinstallato e versione non allineata a Playwright:

```bash
A11Y_CHROMIUM_PATH=/percorso/a/chromium npx tsx src/cli/index.ts audit config.json
```

### Comandi

Le fasi sono separate e riprendibili, perché un audit reale non fila liscio: il crawl si interrompe, il cliente aggiunge un dominio, il triage torna dopo due giorni. Ogni fase legge e riscrive `out/run.json`.

```
a11y consent-setup <config>   browser visibile: accetti il banner (e fai il login) una volta sola
a11y crawl   <config>   scoperta URL + clustering per template
a11y scan    <config>   scansione del campione + analisi
a11y triage  <config>   costruisce i pacchetti per il modello / applica le risposte
a11y replay  <config>   ricalcola firme e deduplica su una scansione salvata
a11y report  <config>   dashboard HTML + backlog Excel
a11y audit   <config>   tutto in sequenza
```

---

## Architettura

```
src/
  core/
    types.ts        modello di dominio (zod come fonte di verità)
    wcag.ts         catalogo dei 50 criteri WCAG 2.1 A/AA in italiano
    identity.ts     identità stabile dei componenti (registro delle classi)
  crawl/
    crawler.ts      discovery (sitemap + link) e clustering per template
    fingerprint.ts  firma strutturale delle pagine
  scan/
    browser.ts      avvio browser, shim esbuild per page.evaluate
    axeRunner.ts    axe-core + traduzione italiana delle osservazioni
    consent.ts      banner di consenso: audit, chiusura, diagnostica assistita
    injected.ts     helper eseguiti nella pagina (firma componente, contrasto)
    checks.ts       check che axe non copre
    scanner.ts      orchestrazione per pagina
  analyze/
    analyzer.ts     deduplica per componente + punteggio di severità
    remediation.ts  catalogo italiano dei testi di remediation
    axeRules.it.ts  traduzione delle regole axe più frequenti
    aiPort.ts       IL CONTRATTO con il layer AI
    adapters/       manual.ts (POC) · anthropic.ts (produzione)
  report/
    dashboard.ts    report HTML navigabile
    excel.ts        backlog prioritizzato su 5 fogli
```

### Pipeline

**1 — Discovery e clustering.** Sitemap più crawl a link (nessun browser: migliaia di URL in secondi). Poi raggruppamento per forma dell'URL inferita sull'intero insieme, e conferma col browser su un campione per gruppo. Quando le sonde di un gruppo non concordano, il gruppo viene marcato eterogeneo e campionato più a fondo invece di indovinare: saltare contenuto in silenzio è il modo peggiore di sbagliare un audit.

**2 — Scansione.** axe-core per il livello deterministico, più i check che axe non copre: percorso da tastiera con ordine di focus e trappole, contrasto sugli stati hover e focus, reflow a 320px, spaziatura del testo, inventario alt text con contesto, testi dei link, struttura dei form. Le pagine che rispondono 4xx/5xx sono escluse e segnalate come collegamenti rotti.

**3 — Analisi.** Deduplica per componente, con eccezioni: i difetti a causa unica (una regola CSS che rimuove l'outline ovunque) restano un solo finding; il contrasto si raggruppa per coppia di colori, perché coppie diverse richiedono correzioni diverse. Le occorrenze vengono estrapolate sul numero di pagine del template, così la priorità riflette l'impatto reale e non la dimensione del campione.

**4 — Triage.** Vedi sotto.

**5 — Report.** Dashboard HTML e backlog Excel.

---

## La porta AI

Il trasporto verso il modello è un **dettaglio di implementazione**. Il contratto è fissato e validato a runtime:

```
EvidencePack  --[ qualunque trasporto ]-->  TriageResult
```

Due adapter, stessa interfaccia:

- **`manual`** — scrive su disco pacchetti e prompt già pronti da incollare, rilegge le risposte JSON. È il trasporto del POC, e non è un ripiego: in fase di calibrazione bisogna *leggere* prompt e risposte, perché un prompt che non si guarda mai non si può migliorare.
- **`anthropic`** — stessa identica interfaccia via API.

Il passaggio dall'uno all'altro è una riga di configurazione:

```json
{ "triage": { "adapter": "anthropic", "model": "claude-sonnet-4-6" } }
```

I pacchetti hanno dimensione fissa (`findingsPerPack`, default 12) proprio perché il batching non cambi quando cambia il trasporto.

### Il vincolo che vive nel codice

Il modello può **declassare** un verdetto, riscrivere i testi, assegnare responsabilità e sforzo. Non può **promuovere** un `needs-review` a `fail`: il tetto lo stabilisce la natura del criterio WCAG, non il parere del modello. Il controllo è ridondante rispetto al prompt di proposito.

```bash
npx tsx test/triage-cap.test.mts    # richiede un out/run.json esistente
```

---

## Il ciclo di feedback

Ogni scansione termina con un'**autodiagnosi**: il motore controlla la salute
della propria analisi — finding duplicati, firme instabili, cluster che
inghiottono metà sito, testi non tradotti — e se trova un problema bloccante lo
dichiara invece di consegnare risultati plausibili ma sbagliati.

Quando qualcosa va corretto, `a11y replay` riesegue firme, deduplica e testi su
una scansione **già salvata** e mostra cosa cambia. Serve a validare una
correzione in secondi sui dati veri del cliente, senza rieseguire crawl e
browser. È possibile perché l'evidenza conserva la catena di antenati grezza e
la firma viene composta in Node, non nella pagina.

La regola che ne discende: *non si chiede una nuova scansione per validare una
correzione che il replay può verificare*. Una scansione nuova serve solo quando
cambia qualcosa che si misura nel browser, e in quel caso le correzioni si
accumulano in un giro solo.

## Due lezioni dal primo sito reale

Il primo audit su un sito in produzione ha rivelato due difetti che il fixture
non poteva far emergere, perché il fixture era costruito sulle stesse assunzioni
del motore. Entrambi sono corretti, ed entrambi hanno lasciato un presidio.

**L'identità dei componenti non può poggiare sui nomi delle classi.** Il sito
era un'applicazione React con CSS-in-JS: 108 classi generate su 128. La firma
cambiava a ogni elemento, quindi la deduplica produceva undici finding per un
problema solo e il clustering mandava 617 pagine su 632 nel cestino dei casi
dubbi. Ora la stabilità di una classe si decide per **frequenza fra pagine**,
non per aspetto, con una catena di ripiego che finisce sul percorso strutturale
puro. Il presidio è `fixtures/build-react.mjs`, che riproduce quel mondo.

**Un banner di consenso che non si chiude va dichiarato, non ignorato.** Il
banner era fatto in casa, il motore non è riuscito a chiuderlo e ha proseguito
su tutte e 39 le pagine emettendo una nota di gravità media: contrasti falsati
dall'overlay, ordine di focus catturato, screenshot coperti, e nessun segnale a
chi leggeva. Ora la pagina esce dai risultati con una motivazione esplicita —
meglio nessun dato che dati falsi — e il motore elenca i candidati cliccabili
trovati dentro il banner, così chi rivede copia un selettore invece di aprire
DevTools.

Come corollario: i componenti di **terze parti** (reCAPTCHA, UserWay, chat,
mappe, video) vengono riconosciuti e attribuiti al fornitore. Sul sito reale il
terzo finding per punteggio era interamente il badge reCAPTCHA di Google.

## La scala di ripieghi per il consenso

Dal più automatico al più assistito. Si scende di un gradino solo se il
precedente fallisce.

1. **Riconoscimento della piattaforma** — undici CMP note (Iubenda, OneTrust,
   Cookiebot, Complianz, CookieYes, Usercentrics, Didomi, Borlabs, Osano, Klaro,
   Cookie Notice). Copre la maggior parte dei siti, senza configurazione.
2. **Euristica sul testo** — pulsante di accettazione riconosciuto per testo,
   italiano e inglese, includendo div e span con handler JavaScript.
3. **Override in configurazione** — `consent.acceptSelector`. Trenta secondi di
   ispezione valgono più di qualsiasi euristica, e il risultato è ripetibile.
4. **Diagnostica assistita** — se fallisce, il motore stampa i candidati trovati
   dentro il banner con testo e selettore, pronti da copiare.
5. **`a11y consent-setup`** — browser visibile, una persona accetta a mano una
   volta, lo stato del browser viene salvato e riusato da tutte le scansioni.
   **Lo stesso meccanismo risolve le aree autenticate**: se durante quella
   sessione si fa anche il login, le scansioni successive entrano nelle pagine
   riservate.
6. **Fallimento esplicito** — se nulla ha funzionato, la pagina esce dai
   risultati con la motivazione, invece di inquinarli in silenzio.

Il banner viene comunque **auditato prima di essere chiuso**, come componente a
sé: è la prima barriera che incontra un utente e spesso la più grave. Per questo
la prima pagina di ogni scansione viene visitata "a freddo", senza stato salvato.

## Cosa manca per passare da POC a strumento

In ordine di valore:

1. **Interfaccia web** — oggi è una CLI. Serve una UI per configurare i progetti, lanciare le scansioni, sfogliare i risultati e gestire la coda di revisione umana (che è il vero collo di bottiglia operativo).
2. **Persistenza e storico** — oggi lo stato è un `run.json` per progetto. Servono database, confronto fra scansioni successive (*questo difetto è nuovo o è il solito?*) e tracciamento della remediation nel tempo.
3. **Scansioni schedulate** — verifica periodica dell'ecosistema, con avviso sulle regressioni.
4. **Autenticazione** — per auditare le aree riservate (intranet, segreteria online) serve gestire il login.
5. **Coda di revisione per non esperti** — l'interfaccia che mostra al designer screenshot, domanda chiusa e risposta sì/no, senza mai nominare un criterio WCAG. È il pezzo che rende il processo delegabile.
6. **Ampliamento del catalogo** — `axeRules.it.ts` copre le regole più frequenti; quelle scoperte sul campo vanno aggiunte. Un'osservazione che compare in inglese nel report è il segnale.

## I due siti di prova

Servono a verificare che il motore intercetti ciò che deve e non inventi ciò che
non c'è. Vanno rilanciati entrambi dopo ogni modifica ai check.

**Classico** — finto ecosistema universitario, 58 pagine, template condivisi,
classi semantiche scritte a mano. Difetti piantati: outline del focus rimosso,
contrasto insufficiente anche in hover, alt text uguale al nome del file, link
generici ripetuti, form con placeholder al posto delle etichette, tabella a
larghezza fissa, `tabindex` positivo, pagina senza `lang`, template senza
`main`, testo tagliato dalla spaziatura, banner cookie non raggiungibile da
tastiera, contenuto caricato solo dopo lo scroll.

```bash
node fixtures/build.mjs && node fixtures/serve.mjs &
npx tsx src/cli/index.ts audit config.fixture.json
```

**React** — imita un'applicazione con CSS-in-JS: classi hashate diverse a ogni
istanza, id generati in stile `useId`, widget di terze parti (reCAPTCHA,
UserWay, YouTube), banner di consenso fatto in casa con un testo che nessuna
euristica riconosce. Esiste perché la categoria di difetti che ha fatto fallire
il primo audit reale non possa più sfuggire.

```bash
node fixtures/build-react.mjs && node fixtures/serve-react.mjs &
npx tsx src/cli/index.ts audit config.react.json
```

Riferimento dell'ultima verifica: classico 418 evidenze → 29 problemi, 8 difetti
piantati su 8 rilevati; React 260 evidenze → 20 problemi, 35 evidenze di link
generico collassate in 1 finding, 4 finding attribuiti a fornitori terzi.

---

## Avvertenza per i documenti consegnati

La copertura automatica dei criteri WCAG si attesta fra il 30% e il 57% a seconda dello studio. Questo strumento non sostituisce la verifica con tecnologie assistive né la validazione di un esperto, e non costituisce di per sé dichiarazione di conformità. Il testo è già riportato in coda alla dashboard e nel foglio "Sintesi" del backlog.
