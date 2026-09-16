# Stato del progetto

Aggiornato al 16 settembre 2026 · motore v0.6.0

Questo file risponde a una domanda sola: **se riprendo in mano il progetto fra
tre mesi, o se lo passo a qualcun altro, cosa devo sapere per non ricominciare
da capo.** Il razionale delle scelte sta in `decisioni.md`, la cronologia in
`../CHANGELOG.md`. Qui c'è dove siamo.

---

## A che serve

Automatizzare la parte automatizzabile di un audit di accessibilità su
ecosistemi multi-sito, secondo WCAG 2.1 AA / EN 301 549 v3.2.1 (la base
vincolante in Italia via Linee Guida AgID). Nato per la commessa Università di
Verona — scenario A validato dal cliente: overlay UserWay sui siti satellite più
Accessibility Audit sui touchpoint principali a partire da www.univr.it.

L'obiettivo non è sostituire il designer. È portargli un backlog già
deduplicato, già prioritizzato e già attribuito, in modo che il suo tempo vada
sul giudizio e non sulla raccolta.

---

## Cosa funziona, misurato

Su www.hintogroup.eu, 632 pagine scoperte, 88 scansionate, 37 template:

| | |
|---|---|
| Evidenze raccolte | 2 407 |
| Problemi distinti dopo deduplica | 75 |
| Compressione | 32× |
| Attribuzione | 39 front-end · 18 design · 13 contenuti · 4 fornitori terzi · 1 CMS |
| Durata | circa 40 minuti |

Sui siti di prova la suite di regressione verifica 8 difetti piantati su 8,
la tenuta della deduplica su classi generate, l'attribuzione ai fornitori, la
ripresa dopo interruzione, il ricalcolo su scansioni vecchie e il tetto ai
verdetti automatici.

---

## Cosa NON fa, e va detto al cliente

- **Non giudica se un testo alternativo è adeguato**, solo se c'è. `alt="foto"`
  su un grafico passa il controllo automatico ed è inutile per chi non vede.
- **Non prova il sito con uno screen reader.** Nessuno strumento automatico lo
  fa davvero: l'esperienza con NVDA o VoiceOver resta verifica umana.
- **Non valuta la comprensibilità del linguaggio** né la coerenza dei percorsi
  di navigazione.
- **Copre una parte dei criteri**, non tutti: `src/core/wcag.ts` dichiara per
  ognuno dei 50 criteri A/AA quanto è automatizzabile, ed è la fonte da citare
  quando un cliente chiede "quanto avete verificato davvero".

Il tetto ai verdetti automatici è imposto nel codice (`applyTriage`), non solo
nel prompt: il modello non può promuovere un verdetto oltre il massimo che quel
criterio consente in automatico.

---

## Come si lavora

Ci sono tre modi di entrare, in ordine di quanto chiedono a chi li usa.

**1. L'applicazione** — `Studio accessibilita.app`, per i colleghi. Contiene il
codice e Node.js, si installa da sola alla prima apertura e non chiede nulla.
Si costruisce sul proprio Mac con l'icona **Prepara pacchetto** (o
`bash scripts/crea-pacchetto.sh`) e si consegna come allegato a una Release di
GitHub — non via Drive o come allegato di posta, dove i filtri aziendali la
bloccano.

**2. Lo Studio dal repository** — `npm run studio`, oppure l'icona
**Avvia Studio** creata da `installa.command`. Stessa interfaccia, codice vivo.

**3. La riga di comando** — quello che segue. È la strada di chi lavora sul
motore.

```bash
npm install
npx playwright install chromium

npm run audit -- --smoke config.hinto.json    # giro di prova, pochi minuti
npm run audit -- config.hinto.json            # scansione completa
npm run audit -- --reuse-crawl config.hinto.json   # riprende se si è interrotta
npm run replay -- config.hinto.json           # ricalcola sui dati già raccolti
npm run griglia -- out-hinto/run.json confronto/griglia.xlsx
npm run verify                                # suite di regressione
```

**La regola operativa che vale più di tutte** (decisione 12): prima di chiedere
una scansione nuova, verificare se esiste già un `run.json` su cui validare la
correzione. La risposta è quasi sempre sì. Una scansione serve solo quando
cambia qualcosa che si misura nel browser — un check nuovo, il crawl, la
gestione del consenso.

**Prima di ogni scansione lunga**: `--smoke`. Percorre lo stesso codice su un
campione ridotto. Se l'autodiagnosi è pulita lì, lo sarà anche sulla scansione
intera.

---

## Il ciclo di feedback

Tre meccanismi, nati tutti dallo stesso errore ripetuto: correzioni validate su
dati sintetici e poi fatte pagare all'utente come scansione reale.

1. **Autodiagnosi** (`src/analyze/selfCheck.ts`) — a fine analisi il motore
   cerca le proprie patologie note e dichiara se i risultati sono consegnabili.
   Un output sbagliato è comunque plausibile: chi legge non ha modo di
   distinguerlo da uno corretto, quindi deve dirlo il motore.
2. **`replay`** — ricalcola firme, deduplica, severità e testi su una scansione
   salvata, in secondi, senza rete. Funziona anche sulle scansioni anteriori
   alla 0.3.0.
3. **Suite di regressione** — ogni euristica porta con sé il campione reale su
   cui è stata tarata, come test. Vedi decisione 13.

---

## Aperto, in ordine di priorità

1. **Confronto con il designer.** La griglia è pronta
   (`confronto/griglia-confronto.xlsx`, generata da `npm run griglia`). Il
   protocollo è nel foglio Istruzioni: analisi manuale in cieco **prima**,
   confronto dopo. È il passo che dice se lo strumento regge.
2. **Documento di restituzione** in stile Hinto, generato dai dati dell'analisi.
3. **Nessun test automatico copre lo Studio e il pacchetto.** La suite verifica
   il motore; l'interfaccia è stata controllata con axe (zero violazioni) ma a
   mano, e tutta la parte macOS — app, icone, finestra, installazione — si
   verifica solo aprendola su un Mac. È la parte che nelle ultime versioni ha
   prodotto più errori, ed è anche l'unica senza rete di sicurezza.
4. **Residui noti sull'ultima scansione**: 4 gruppi di finding ancora duplicati
   per via degli id costruiti dal CMS (corretto nella 0.3.1, da verificare alla
   prossima scansione); 477 evidenze `axe-incomplete:color-contrast` su testo
   sopra immagini, che andrebbero trattate a livello di pattern invece che una
   per una.

---

## Vincoli da non perdere di vista

- **axe-core è MPL-2.0**: si usa come dipendenza, non si modifica. Le
  integrazioni stanno in file nostri. Vedi `../NOTICE.md` e decisione 10.
- **Il motore appartiene all'infrastruttura Hinto**, non a una sessione di
  chat. Le scansioni girano dove c'è accesso di rete al sito del cliente.
- **I risultati non vanno in repository**: contengono URL, screenshot e talvolta
  contenuti dei clienti. Il `.gitignore` li esclude già.
- **Codice e dati stanno in due posti diversi** (0.6.0): il codice dove è
  installato, i progetti in `Documenti/Studio accessibilita`. La variabile
  `A11Y_DATI` decide la seconda; se non è impostata coincidono, ed è il caso di
  chi lavora nel repository.
- **Il caricamento web di GitHub azzera il permesso di esecuzione.** Vale per
  ogni `.command` e per l'app: è il motivo per cui il pacchetto si costruisce
  sul Mac e si pubblica come allegato a una Release, non come ZIP del
  repository.
- **AgID, determinazione n. 38 del 4 marzo 2026, sezione 5.1**: gli overlay che
  non tracciano le tecnologie assistive sono sotto osservazione. Riguarda
  direttamente UserWay, che è parte dello scenario venduto a UniVR. Da
  monitorare.
