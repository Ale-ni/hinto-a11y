# Installare lo Studio accessibilità

Non serve saper programmare. Non serve usare il Terminale, tranne che per due
doppi clic che aprono una finestra nera: quella finestra è normale, scrive
quello che sta facendo, e si chiude da sola quando premi Invio.

Tempo: **circa dieci minuti**, una volta sola.

---

## 1. Copia la cartella sul tuo Mac

Ti arriva un file **`studio-accessibilita.zip`**.

1. Doppio clic sul file: si trasforma in una cartella.
2. Trascina la cartella in **Documenti**.

Non lasciarla in Download: lì rischia di essere svuotata automaticamente.

## 2. Installa

Apri la cartella e fai **doppio clic su `installa.command`**.

> **La prima volta macOS dirà di no.** Compare un avviso tipo *«impossibile
> aprire perché proviene da uno sviluppatore non identificato»*. È normale:
> significa solo che il file non è stato comprato dall'App Store.
>
> Fai **clic destro** sul file → **Apri** → nella finestra che compare, **Apri**
> di nuovo. Da quel momento il doppio clic funziona sempre.

Si apre una finestra nera che scrive cosa sta facendo. Aspetta.

**Se dice che manca Node.js**, apre da sola la pagina per scaricarlo:

1. Clicca il pulsante grande a sinistra (quello con scritto **LTS**).
2. Scarica il file `.pkg` e fai doppio clic.
3. Nell'installazione clicca sempre **Continua** e poi **Installa**.
4. Torna alla cartella e fai di nuovo doppio clic su `installa.command`.

Quando in fondo leggi **«Installazione completata»**, hai finito.

## 3. Usa

Doppio clic su **`avvia.command`**. Si apre lo Studio nel browser.

Anche qui, la prima volta: clic destro → Apri → Apri.

La finestra nera deve restare aperta mentre lavori — è il programma che gira.
Per chiudere tutto: torna nella finestra nera e premi **Ctrl+C**.

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

**Il sito ha un banner dei cookie che blocca l'analisi** → nella scheda Analisi
c'è **Accetta il banner a mano**. Si apre una finestra del browser, accetti una
volta, e le analisi successive non lo rivedono.

**La finestra nera si chiude subito** → probabilmente manca Node.js. Rifai il
passo 2.

**Qualsiasi altra cosa** → foto della finestra nera ad Alessio. Il messaggio
d'errore dice quasi sempre cosa è successo.

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
