/**
 * Catalogo di remediation per i check custom.
 *
 * Serve a due cose. Primo: il motore resta utile anche a layer AI spento -
 * il backlog esce gia' con titolo, spiegazione e istruzioni in italiano.
 * Secondo: da' al triage AI un riferimento da migliorare invece di una pagina
 * bianca, il che rende gli output molto piu' stabili fra un run e l'altro.
 *
 * Il tono e' deliberatamente operativo e rivolto a chi NON conosce le WCAG:
 * niente gergo, niente numeri di criterio nel testo, si dice cosa fare.
 */

export interface RemediationTemplate {
  title: string;
  description: string;
  remediation: string;
  codeExample?: string;
  owner: 'frontend' | 'contenuti' | 'design' | 'cms' | 'fornitore-terzo' | 'da-definire';
  effort: 'basso' | 'medio' | 'alto';
  /** Fiducia nel verdetto automatico, 0-1 */
  confidence: number;
}

export const REMEDIATION: Record<string, RemediationTemplate> = {
  /* --- struttura --- */
  'heading-no-h1': {
    title: 'Pagina senza titolo principale (h1)',
    description:
      'La pagina non dichiara qual e\' il suo titolo principale. Chi usa uno screen reader si orienta saltando da un titolo all\'altro: senza h1 manca il punto di partenza.',
    remediation:
      'Inserire un solo h1 per pagina, che corrisponda al titolo visibile del contenuto. Nei template del CMS di solito e\' il campo titolo del nodo.',
    codeExample: '<main>\n  <h1>Corso di laurea in Informatica</h1>\n  ...\n</main>',
    owner: 'frontend',
    effort: 'basso',
    confidence: 0.95,
  },
  'heading-multiple-h1': {
    title: 'Piu\' titoli principali nella stessa pagina',
    description:
      'Ci sono piu\' h1: la gerarchia perde significato e chi naviga per titoli non capisce quale sia il contenuto principale.',
    remediation:
      'Tenere un solo h1 (il titolo della pagina) e declassare gli altri a h2 o inferiori, seguendo la gerarchia reale del contenuto.',
    owner: 'frontend',
    effort: 'basso',
    confidence: 0.9,
  },
  'heading-skipped-level': {
    title: 'Salto di livello nella gerarchia dei titoli',
    description:
      'La sequenza dei titoli salta un livello. Chi naviga per struttura percepisce un buco: sembra che manchi una sezione.',
    remediation:
      'Usare i livelli in ordine (h1, poi h2, poi h3) senza saltarne. Se il salto nasce dal bisogno di un carattere piu\' piccolo, usare il livello corretto e cambiare la dimensione col CSS.',
    owner: 'frontend',
    effort: 'basso',
    confidence: 0.85,
  },
  'heading-empty': {
    title: 'Titolo vuoto',
    description: 'Un elemento di intestazione non contiene testo: viene annunciato come titolo senza nome.',
    remediation:
      'Rimuovere il tag di intestazione se serviva solo a impaginare, oppure inserirci il testo che gli compete.',
    owner: 'frontend',
    effort: 'basso',
    confidence: 0.95,
  },
  'landmark-no-main': {
    title: 'Manca l\'area di contenuto principale',
    description:
      'La pagina non dichiara dove inizia il contenuto vero. Chi usa uno screen reader e\' costretto a riascoltare menu e intestazione a ogni pagina.',
    remediation:
      'Racchiudere il contenuto principale in un elemento <main>, uno solo per pagina, escludendo header, menu e footer.',
    codeExample: '<body>\n  <header>...</header>\n  <nav>...</nav>\n  <main id="contenuto">\n    <h1>...</h1>\n  </main>\n  <footer>...</footer>\n</body>',
    owner: 'frontend',
    effort: 'basso',
    confidence: 0.95,
  },
  'landmark-multiple-main': {
    title: 'Piu\' aree di contenuto principale',
    description: 'Sono dichiarati piu\' <main>: l\'indicazione perde valore perche\' non e\' piu\' univoca.',
    remediation: 'Tenere un solo <main> per pagina e trasformare gli altri in <section> o <div>.',
    owner: 'frontend',
    effort: 'basso',
    confidence: 0.9,
  },
  'landmark-nav-unlabeled': {
    title: 'Aree di navigazione non distinguibili',
    description:
      'La pagina ha piu\' menu ma non sono etichettati: lo screen reader li annuncia tutti come "navigazione", senza dire quale sia quale.',
    remediation:
      'Dare a ogni menu un\'etichetta che lo descriva, con aria-label.',
    codeExample: '<nav aria-label="Menu principale">...</nav>\n<nav aria-label="Percorso di navigazione">...</nav>',
    owner: 'frontend',
    effort: 'basso',
    confidence: 0.85,
  },
  'title-missing': {
    title: 'Pagina senza titolo',
    description:
      'Manca il titolo della pagina: e\' la prima cosa annunciata dallo screen reader e quella che compare nella scheda del browser e nei preferiti.',
    remediation: 'Popolare il tag <title> con una formula del tipo "Titolo del contenuto - Nome del sito".',
    owner: 'cms',
    effort: 'basso',
    confidence: 0.95,
  },
  'title-too-short': {
    title: 'Titolo di pagina poco descrittivo',
    description: 'Il titolo e\' troppo corto per identificare la pagina fra piu\' schede aperte o nella cronologia.',
    remediation: 'Rendere il titolo descrittivo e univoco, includendo il nome del sito.',
    owner: 'cms',
    effort: 'basso',
    confidence: 0.6,
  },
  'skiplink-missing': {
    title: 'Manca il link "salta al contenuto"',
    description:
      'Chi naviga da tastiera deve attraversare tutto il menu prima di arrivare al contenuto, a ogni singola pagina.',
    remediation:
      'Inserire come primo elemento della pagina un link che punta all\'area di contenuto. Puo\' restare invisibile finche\' non riceve il focus, ma deve diventare visibile quando lo riceve.',
    codeExample:
      '<a class="skip-link" href="#contenuto">Salta al contenuto</a>\n\n.skip-link { position:absolute; left:-9999px; }\n.skip-link:focus { position:static; }',
    owner: 'frontend',
    effort: 'basso',
    confidence: 0.75,
  },

  /* --- immagini --- */
  'img-empty-alt-in-link': {
    title: 'Link con sola immagine e senza nome',
    description:
      'Un link contiene solo un\'immagine il cui testo alternativo e\' vuoto: il link viene annunciato senza nome e diventa inutilizzabile.',
    remediation:
      'Descrivere nel testo alternativo la DESTINAZIONE del link, non l\'aspetto dell\'immagine.',
    codeExample: '<a href="/home"><img src="logo.svg" alt="Home - Universita di Verona"></a>',
    owner: 'frontend',
    effort: 'basso',
    confidence: 0.95,
  },
  'img-empty-alt-review': {
    title: 'Immagine dichiarata decorativa da verificare',
    description:
      'L\'immagine ha un testo alternativo vuoto, il che e\' corretto solo se e\' puramente decorativa. Se invece veicola informazione, quell\'informazione oggi non arriva a chi non vede.',
    remediation:
      'Verificare caso per caso: se l\'immagine aggiunge significato, scrivere un\'alternativa testuale; se e\' solo ornamento, lasciare alt="" (corretto cosi\').',
    owner: 'contenuti',
    effort: 'medio',
    confidence: 0.3,
  },
  'img-alt-is-filename': {
    title: 'Testo alternativo uguale al nome del file',
    description:
      'Il testo alternativo ripete il nome del file: non descrive nulla e viene letto come una sequenza priva di senso.',
    remediation:
      'Sostituire con una descrizione che comunichi cosa mostra l\'immagine e perche\' e\' li\'. Se non aggiunge significato, usare alt="".',
    owner: 'contenuti',
    effort: 'medio',
    confidence: 0.85,
  },
  'img-alt-placeholder': {
    title: 'Testo alternativo generico',
    description:
      'Il testo alternativo e\' un segnaposto ("immagine", "foto", "logo") e non dice nulla del contenuto.',
    remediation:
      'Descrivere il contenuto o la funzione. Evitare di iniziare con "immagine di": lo screen reader annuncia gia\' che si tratta di un\'immagine.',
    owner: 'contenuti',
    effort: 'medio',
    confidence: 0.85,
  },
  'img-alt-too-long': {
    title: 'Testo alternativo troppo lungo',
    description:
      'Il testo alternativo e\' molto lungo: viene letto tutto d\'un fiato, senza possibilita\' di navigarlo o rileggerlo.',
    remediation:
      'Tenere l\'alternativa breve e spostare la descrizione estesa nel contenuto della pagina o in una didascalia.',
    owner: 'contenuti',
    effort: 'medio',
    confidence: 0.6,
  },
  'img-alt-duplicates-caption': {
    title: 'Testo alternativo che ripete la didascalia',
    description: 'Alternativa e didascalia sono identiche: la stessa frase viene annunciata due volte di seguito.',
    remediation:
      'Se la didascalia descrive gia\' l\'immagine, usare alt="" sull\'immagine; altrimenti differenziare i due testi.',
    owner: 'contenuti',
    effort: 'basso',
    confidence: 0.7,
  },
  'bg-image-review': {
    title: 'Immagine di sfondo da verificare',
    description:
      'Un\'immagine di sfondo di dimensioni rilevanti puo\' contenere testo o informazione: in quel caso il contenuto non arriva alle tecnologie assistive e non si ingrandisce con lo zoom.',
    remediation:
      'Se l\'immagine contiene testo o informazione, portarla in un <img> con alternativa testuale, o riprodurre il testo come testo reale sopra lo sfondo.',
    owner: 'design',
    effort: 'medio',
    confidence: 0.25,
  },

  /* --- link --- */
  'link-generic-text': {
    title: 'Link con testo generico',
    description:
      'Il link si chiama "leggi tutto" o simili. Chi usa uno screen reader spesso naviga richiamando l\'elenco dei link: fuori contesto, una lista di venti "leggi tutto" e\' inutilizzabile.',
    remediation:
      'Rendere il testo del link autoesplicativo. Se il progetto grafico impone la dicitura breve, mantenerla visibile e aggiungere il resto in forma accessibile.',
    codeExample:
      '<a href="/corsi/informatica">Leggi tutto <span class="sr-only">sul corso di laurea in Informatica</span></a>',
    owner: 'contenuti',
    effort: 'medio',
    confidence: 0.8,
  },
  'link-same-text-different-targets': {
    title: 'Stesso testo per link con destinazioni diverse',
    description:
      'Piu\' link hanno lo stesso nome ma portano a pagine diverse: non c\'e\' modo di distinguerli senza il contesto visivo.',
    remediation: 'Differenziare i testi, oppure completarli con la parte mancante resa accessibile.',
    owner: 'contenuti',
    effort: 'medio',
    confidence: 0.7,
  },
  'link-new-window-unannounced': {
    title: 'Apertura in nuova finestra senza preavviso',
    description:
      'Il link apre una scheda nuova senza dirlo: il tasto "indietro" smette di funzionare come l\'utente si aspetta, cosa particolarmente disorientante per chi non vede il cambio di contesto.',
    remediation: 'Segnalare l\'apertura in nuova finestra nel testo del link o nel suo nome accessibile.',
    codeExample: '<a href="..." target="_blank">Bando di ammissione <span class="sr-only">(si apre in una nuova finestra)</span></a>',
    owner: 'contenuti',
    effort: 'basso',
    confidence: 0.75,
  },
  'link-raw-url-text': {
    title: 'URL usato come testo del link',
    description: 'Il testo del link e\' un indirizzo completo: lo screen reader lo scandisce carattere per carattere.',
    remediation: 'Sostituire l\'indirizzo con una descrizione della destinazione.',
    owner: 'contenuti',
    effort: 'basso',
    confidence: 0.8,
  },

  /* --- form --- */
  'form-placeholder-as-label': {
    title: 'Placeholder usato al posto dell\'etichetta',
    description:
      'Il campo e\' identificato solo dal testo grigio interno. Quel testo sparisce appena si inizia a scrivere, ha contrasto insufficiente e molti screen reader non lo annunciano: chi compila non sa piu\' cosa stava inserendo.',
    remediation:
      'Aggiungere una <label> associata al campo. Il placeholder puo\' restare, ma come suggerimento aggiuntivo, non come etichetta.',
    codeExample:
      '<label for="email">Indirizzo email</label>\n<input type="email" id="email" name="email" autocomplete="email" placeholder="nome@esempio.it">',
    owner: 'frontend',
    effort: 'basso',
    confidence: 0.9,
  },
  'form-required-not-indicated': {
    title: 'Campo obbligatorio non dichiarato nell\'etichetta',
    description:
      'Il campo e\' obbligatorio ma l\'etichetta non lo dice: l\'utente lo scopre solo dopo l\'errore di invio.',
    remediation: 'Indicare l\'obbligatorieta\' nell\'etichetta, non solo con un asterisco colorato.',
    owner: 'frontend',
    effort: 'basso',
    confidence: 0.65,
  },
  'form-missing-autocomplete': {
    title: 'Campo di dati personali senza autocomplete',
    description:
      'Il campo raccoglie un dato personale ma non lo dichiara: browser e tecnologie assistive non possono proporre la compilazione automatica, che per molti utenti e\' la differenza fra compilare e rinunciare.',
    remediation: 'Aggiungere l\'attributo autocomplete con il valore previsto dalle specifiche.',
    codeExample: '<input type="tel" name="telefono" autocomplete="tel">',
    owner: 'frontend',
    effort: 'basso',
    confidence: 0.8,
  },
  'form-radiogroup-no-fieldset': {
    title: 'Gruppo di opzioni senza domanda associata',
    description:
      'Le opzioni sono lette una a una senza la domanda a cui rispondono: si sente "Si\'", "No" senza sapere di cosa si stia parlando.',
    remediation: 'Racchiudere il gruppo in un <fieldset> con una <legend> che contenga la domanda.',
    codeExample:
      '<fieldset>\n  <legend>Vuoi ricevere la newsletter?</legend>\n  <input type="radio" id="si" name="news" value="si"><label for="si">Si</label>\n  <input type="radio" id="no" name="news" value="no"><label for="no">No</label>\n</fieldset>',
    owner: 'frontend',
    effort: 'basso',
    confidence: 0.85,
  },
  'form-search-no-submit': {
    title: 'Ricerca senza pulsante di invio',
    description:
      'Il form di ricerca non ha un pulsante: funziona solo premendo Invio, cosa che non e\' evidente e che alcune tecnologie assistive non attivano.',
    remediation: 'Aggiungere un pulsante di invio con un nome accessibile esplicito.',
    codeExample: '<button type="submit">Cerca</button>',
    owner: 'frontend',
    effort: 'basso',
    confidence: 0.7,
  },

  /* --- tastiera e focus --- */
  'focus-not-visible': {
    title: 'Indicatore di focus rimosso',
    description:
      'L\'elemento puo\' ricevere il focus ma non lo mostra in alcun modo. Chi naviga da tastiera perde completamente il segno di dove si trova: e\' la violazione piu\' frequente in assoluto e una delle piu\' bloccanti.',
    remediation:
      'Non rimuovere mai l\'outline senza sostituirlo. Se il default non piace, disegnare un indicatore ad alto contrasto, spesso almeno 2px e ben staccato dall\'elemento.',
    codeExample:
      ':focus-visible {\n  outline: 3px solid #1a5fb4;\n  outline-offset: 2px;\n}\n\n/* Mai fare questo senza sostituto: */\n/* :focus { outline: none; } */',
    owner: 'frontend',
    effort: 'basso',
    confidence: 0.9,
  },
  'keyboard-trap-suspected': {
    title: 'Sospetta trappola da tastiera',
    description:
      'Il focus resta bloccato sullo stesso elemento: chi naviga da tastiera non riesce piu\' a proseguire e deve ricaricare la pagina. E\' un blocco totale.',
    remediation:
      'Verificare il componente: deve essere sempre possibile uscirne con Tab e, se e\' una finestra modale, chiuderlo con Esc.',
    owner: 'frontend',
    effort: 'alto',
    confidence: 0.6,
  },
  'keyboard-focus-on-hidden': {
    title: 'Focus su elemento non visibile',
    description:
      'Il focus finisce su qualcosa che non si vede (spesso un menu chiuso o un elemento fuori schermo). L\'utente da tastiera preme Tab e il segno di posizione sparisce.',
    remediation:
      'Togliere dal percorso di tabulazione gli elementi non visibili, con display:none, visibility:hidden o l\'attributo inert.',
    owner: 'frontend',
    effort: 'medio',
    confidence: 0.8,
  },
  'keyboard-positive-tabindex': {
    title: 'tabindex positivo',
    description:
      'Un tabindex maggiore di zero forza un ordine di tabulazione artificiale, che quasi sempre diverge da quello visivo e si rompe appena la pagina cambia.',
    remediation:
      'Usare solo tabindex="0" (inserisce nell\'ordine naturale) o tabindex="-1" (focalizzabile solo via codice), e sistemare l\'ordine agendo sull\'ordine del DOM.',
    owner: 'frontend',
    effort: 'medio',
    confidence: 0.9,
  },
  'focus-order-suspicious': {
    title: 'Ordine di tabulazione potenzialmente illogico',
    description:
      'Durante la tabulazione il focus risale piu\' volte verso l\'alto nel layout. Puo\' essere legittimo, ma spesso segnala un ordine del DOM che non corrisponde a quello visivo.',
    remediation:
      'Percorrere la pagina con Tab e verificare che la sequenza segua la logica di lettura. Se non lo fa, riordinare il DOM invece di forzare con tabindex o con il CSS.',
    owner: 'frontend',
    effort: 'medio',
    confidence: 0.35,
  },
  'keyboard-no-focusable': {
    title: 'Nessun elemento raggiungibile da tastiera',
    description: 'Premendo Tab non si raggiunge nulla: la pagina potrebbe essere del tutto inutilizzabile senza mouse.',
    remediation: 'Verificare che i controlli siano elementi nativi interattivi o abbiano tabindex="0" e gestione da tastiera.',
    owner: 'frontend',
    effort: 'alto',
    confidence: 0.7,
  },

  /* --- banner di consenso --- */
  'consent-not-keyboard-reachable': {
    title: 'Banner di consenso non raggiungibile da tastiera',
    description:
      'Il banner copre la pagina ma non si raggiunge premendo Tab. Chi non usa il mouse non puo\' ne\' accettare ne\' rifiutare, quindi non arriva mai al contenuto: il sito risulta del tutto inaccessibile fin dal primo secondo. Non e\' un problema fra gli altri, e\' una barriera totale.',
    remediation:
      'Il banner deve ricevere il focus all\'apertura, trattenerlo al suo interno finche\' resta aperto (come una finestra modale) e restituirlo alla pagina alla chiusura. Se il banner e\' fornito da terzi, la correzione va chiesta al fornitore: la responsabilita\' verso l\'utente resta comunque di chi pubblica il sito.',
    owner: 'frontend',
    effort: 'medio',
    confidence: 0.85,
  },
  'consent-not-dismissable': {
    title: 'Banner di consenso non chiudibile automaticamente',
    description:
      'La scansione non e\' riuscita a chiudere il banner. I risultati di queste pagine possono riferirsi al banner invece che al contenuto sottostante, quindi vanno letti con cautela.',
    remediation:
      'Verificare manualmente la pagina a banner chiuso. Se il banner non si chiude nemmeno a mano in modo prevedibile, e\' un problema di per se\'.',
    owner: 'frontend',
    effort: 'basso',
    confidence: 0.5,
  },

  /* --- contrasto e layout --- */
  'contrast-hover-insufficient': {
    title: 'Contrasto insufficiente al passaggio del mouse',
    description:
      'A riposo il contrasto e\' adeguato, ma nello stato hover scende sotto la soglia. Gli strumenti automatici standard non se ne accorgono perche\' misurano solo lo stato di riposo.',
    remediation: 'Verificare il contrasto di tutti gli stati (riposo, hover, focus, visitato, disabilitato) e correggere la palette dello stato interessato.',
    owner: 'design',
    effort: 'basso',
    confidence: 0.85,
  },
  'reflow-horizontal-scroll': {
    title: 'Scorrimento orizzontale su schermo stretto',
    description:
      'A 320 pixel di larghezza la pagina richiede di scorrere lateralmente per leggere. Colpisce chi usa il telefono e soprattutto chi ingrandisce molto la pagina.',
    remediation:
      'Rendere fluido il layout: larghezze in percentuale, max-width:100% sui media, wrapping dei contenitori flex.',
    owner: 'frontend',
    effort: 'medio',
    confidence: 0.9,
  },
  'reflow-overflowing-element': {
    title: 'Elemento che sfora su schermo stretto',
    description:
      'Un elemento specifico e\' piu\' largo dello schermo e provoca lo scorrimento orizzontale dell\'intera pagina.',
    remediation:
      'Individuare la larghezza fissa o il contenuto non comprimibile e renderlo fluido. Tabelle e blocchi di codice possono restare larghi, ma dentro un contenitore con scorrimento proprio.',
    codeExample: '.tabella-wrapper { overflow-x: auto; }\nimg, video, iframe { max-width: 100%; }',
    owner: 'frontend',
    effort: 'medio',
    confidence: 0.9,
  },
  'text-spacing-clipped': {
    title: 'Testo tagliato aumentando la spaziatura',
    description:
      'Aumentando interlinea e spaziatura - cosa che molte persone dislessiche o ipovedenti fanno di default - il testo esce dal suo contenitore e viene tagliato.',
    remediation:
      'Evitare altezze fisse sui contenitori di testo: usare min-height invece di height ed eliminare overflow:hidden dove nasconde contenuto.',
    owner: 'frontend',
    effort: 'medio',
    confidence: 0.8,
  },
};

/** Fiducia di default per le violazioni axe, per regola. */
export function axeConfidence(ruleId: string, isIncomplete: boolean): number {
  if (isIncomplete) return 0.35;
  // regole storicamente rumorose: il contrasto sbaglia su sfondi complessi
  const noisy = ['color-contrast', 'color-contrast-enhanced', 'region', 'scrollable-region-focusable'];
  return noisy.includes(ruleId) ? 0.8 : 0.95;
}
