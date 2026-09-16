# Installare lo Studio accessibilità

Non serve saper programmare, non serve il Terminale, non serve installare
niente prima. Scarichi un file, lo apri, e la prima volta aspetti qualche
minuto.

Serve un **Mac con chip Apple** (M1 del 2020 o successivo). Se non sai quale
hai: menu  → Informazioni su questo Mac, alla voce Chip deve esserci scritto
*Apple*, non *Intel*.

---

## 1. Scarica

Alessio ti manda un link a una pagina di GitHub. Nella pagina, in fondo, c'è un
file che si chiama **`Studio-accessibilita-....zip`**: cliccalo per scaricarlo.
Sono circa 60 MB.

Doppio clic sul file scaricato: diventa un'applicazione, **Studio
accessibilità**. Trascinala dove preferisci — la scrivania va benissimo,
la cartella Applicazioni anche.

Non lasciarla in Download: quella cartella può essere svuotata
automaticamente.

## 2. Prima apertura

**La prima volta fai clic destro sull'applicazione → Apri → Apri.**

Se fai doppio clic normale, macOS ti dice che *proviene da uno sviluppatore non
identificato* e non ti lascia proseguire. Non è un allarme sul contenuto:
significa solo che il programma non è stato pubblicato sull'App Store, cosa che
richiede un abbonamento da sviluppatore Apple. Il clic destro serve a dire «lo
so, aprila lo stesso», e va fatto una volta sola.

Si apre una finestra nera che scrive cosa sta facendo: scarica i componenti e
il browser con cui esegue le analisi. **Ci vogliono cinque o dieci minuti**, e
succede **solo la prima volta**. Al termine la finestra nera si toglie di mezzo
da sola e lo Studio si apre nella propria finestra.

## 3. Le volte dopo

Doppio clic sull'applicazione: si apre in pochi secondi, nella sua finestra.
Niente finestra nera, niente browser con schede e barra degli indirizzi.

Per chiudere: il pulsante **Chiudi lo Studio**, in alto a destra.

I tuoi progetti e i risultati stanno in **Documenti → Studio accessibilita**.
Quella cartella contiene **soltanto il tuo lavoro**: niente file di programma.
Resta lì anche quando l'applicazione viene sostituita con una versione nuova.

Il motore vero e proprio sta altrove, in Libreria, dove macOS tiene le cose che
i programmi gestiscono da soli. Non devi aprirla mai.

---

## Come si usa lo Studio

Quattro schede, in ordine.

**1 · Progetti** — Crea il progetto: nome del cliente e indirizzo del sito.
Si fa una volta sola per cliente.

**2 · Analisi** — Prima **Giro di prova**: pochi minuti, serve a vedere se
qualcosa non va prima di impegnare mezz'ora. Se non compaiono errori, lancia
**Analisi completa**. Puoi chiudere il portatile: se si interrompe, riprende da
dove era arrivata.

**3 · Revisione** — Qui ci sono i punti che lo strumento **non può decidere da
solo**. Non è un difetto del programma: per una parte dei criteri WCAG nessuno
strumento automatico può dare un verdetto. Guardi la pagina e scegli fra quattro
risposte. «Serve una prova più approfondita» è una risposta valida.

**4 · Risultati** — La dashboard da leggere a schermo e il backlog Excel da
passare a chi corregge.

---

## Quando qualcosa non torna

**«Analisi sana: puoi procedere»** in verde → tutto a posto.

**«Non costruire il documento per il cliente»** in rosso → lo strumento ha
trovato un problema nel **proprio** lavoro, non nel sito. Non è colpa tua e non
è una cosa che puoi sistemare: fai uno screenshot e scrivi ad Alessio.

**macOS dice che l'applicazione è danneggiata** → succede se il file è stato
scaricato in un modo che ne rovina il contenuto, per esempio passando da Drive
o da un allegato di posta. Riscarica dalla pagina di GitHub.

**Il sito ha un banner dei cookie che blocca l'analisi** → nella scheda Analisi
c'è **Accetta il banner a mano**. Si apre una finestra del browser, accetti una
volta, e le analisi successive non lo rivedono.

**La finestra nera si apre e si chiude subito** → fai uno screenshot di quel
poco che compare e mandalo ad Alessio.

**L'applicazione si apre ma la finestra resta bianca** → aspetta una decina di
secondi: al primo avvio dopo un aggiornamento ci mette un po'. Se resta bianca,
chiudi e riapri.

**Qualsiasi altra cosa** → foto della finestra nera ad Alessio, se c'è. Se non
c'è, in **Documenti → Studio accessibilita** trovi un file `studio.log`: è il
diario di quello che è successo, mandalo.

---

## Cosa NON fa questo strumento

Va detto ai clienti, e va saputo da chi conduce l'analisi.

- **Non giudica se un testo alternativo è adeguato**, solo se c'è. `alt="foto"`
  su un grafico passa il controllo automatico ed è inutile per chi non vede.
- **Non prova il sito con uno screen reader.** Nessuno strumento automatico lo
  fa davvero.
- **Non valuta la comprensibilità del linguaggio** né la coerenza dei percorsi
  di navigazione.
- **Copre una parte dei criteri WCAG, non tutti.** Il resto resta lavoro umano —
  ed è il motivo per cui la scheda Revisione esiste.

---

## Appendice — partire dal codice sorgente

Riguarda solo chi lavora sul motore, non chi lo usa.

Chi scarica il repository invece dell'applicazione si trova con i file privi del
permesso di esecuzione: è il caricamento da web di GitHub a registrarli così, e
nessuno sblocco dall'interfaccia lo ripristina. L'installazione va quindi
lanciata una volta in questo modo:

1. Apri il **Terminale** (⌘ + barra spaziatrice, scrivi `Terminale`, Invio).
2. Scrivi `bash` e uno spazio, senza premere Invio.
3. Trascina `installa.command` dentro la finestra del Terminale.
4. Premi Invio.

Al termine trovi nella cartella due icone: **Avvia Studio**, per l'uso
quotidiano, e **Prepara pacchetto**, che costruisce l'applicazione da
consegnare ai colleghi e spiega come pubblicarla.
