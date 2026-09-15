/**
 * Traduzione operativa delle regole axe-core piu' frequenti.
 *
 * axe restituisce testi in inglese e in forma di prescrizione tecnica
 * ("Ensure the contrast between foreground and background colors meets WCAG 2
 * AA minimum contrast ratio thresholds"). Va bene per uno sviluppatore che
 * conosce gia' la materia; non va bene in un documento che leggono referenti
 * di un ateneo e designer che non hanno mai fatto accessibilita'.
 *
 * Qui i testi diventano italiani e - soprattutto - raccontano cosa succede
 * all'utente, non quale soglia e' stata violata.
 */
import type { RemediationTemplate } from './remediation.js';

export const AXE_IT: Record<string, RemediationTemplate> = {
  /**
   * Regola "incomplete" di axe: il colore da solo non basta a distinguere un
   * link dal testo attorno. Ne serve un secondo segnale - di norma la
   * sottolineatura - oppure un contrasto di 3:1 fra link e testo circostante
   * piu' un cambiamento visibile al passaggio e al focus.
   */
  'link-in-text-block': {
    title: 'Link riconoscibile solo dal colore',
    description:
      'Dentro un blocco di testo il link si distingue soltanto per il colore. Chi non percepisce quel colore - daltonismo, monitor tarato male, schermo al sole - non vede che quella parola è cliccabile e perde il collegamento.',
    remediation:
      'Sottolineare i link dentro i blocchi di testo. In alternativa, garantire un contrasto di almeno 3:1 fra il colore del link e quello del testo circostante e aggiungere un segnale non cromatico al passaggio del mouse e al focus da tastiera.',
    owner: 'design',
    effort: 'basso',
    confidence: 0.75,
  },
  'color-contrast': {
    title: 'Contrasto del testo insufficiente',
    description:
      'Il testo non si stacca abbastanza dallo sfondo. Chi ha una vista ridotta, chi legge da mobile in pieno sole e chi ha più di sessant’anni fatica a leggerlo o non ci riesce affatto.',
    remediation:
      'Portare il rapporto di contrasto ad almeno 4.5:1 per il testo normale e 3:1 per quello grande (da 24px, o da 18.7px se in grassetto). Di norma si corregge nella palette del design system, non pagina per pagina.',
    owner: 'design',
    effort: 'basso',
    confidence: 0.8,
  },
  'link-name': {
    title: 'Link senza nome accessibile',
    description:
      'Il link non comunica dove porta alle tecnologie assistive: viene annunciato come "link" e basta. Chi usa uno screen reader non ha modo di sapere cosa ci trova.',
    remediation:
      'Dare al link un testo visibile descrittivo. Se il progetto grafico prevede solo un’icona, aggiungere un nome accessibile con aria-label o con testo riservato agli screen reader.',
    codeExample: '<a href="/ricerca" aria-label="Cerca nel sito"><svg aria-hidden="true">…</svg></a>',
    owner: 'frontend',
    effort: 'basso',
    confidence: 0.95,
  },
  'button-name': {
    title: 'Pulsante senza nome accessibile',
    description:
      'Il pulsante viene annunciato senza indicare cosa fa. Per chi non vede l’icona, è un comando cieco.',
    remediation: 'Aggiungere testo visibile o un aria-label che descriva l’azione, non l’icona.',
    codeExample: '<button aria-label="Chiudi la finestra">×</button>',
    owner: 'frontend',
    effort: 'basso',
    confidence: 0.95,
  },
  'image-alt': {
    title: 'Immagine senza testo alternativo',
    description:
      'Manca del tutto l’attributo alt. Lo screen reader ripiega sul nome del file, che di solito è una sequenza priva di senso, oppure salta l’immagine insieme al suo contenuto informativo.',
    remediation:
      'Aggiungere sempre l’attributo alt: con una descrizione se l’immagine informa, vuoto (alt="") se è puramente decorativa. Un alt assente non equivale mai a un alt vuoto.',
    owner: 'contenuti',
    effort: 'basso',
    confidence: 0.95,
  },
  'html-has-lang': {
    title: 'Lingua della pagina non dichiarata',
    description:
      'La pagina non dice in che lingua è scritta. Lo screen reader applica la pronuncia della lingua di sistema: un testo italiano letto con fonetica inglese è incomprensibile.',
    remediation: 'Aggiungere l’attributo lang all’elemento html.',
    codeExample: '<html lang="it">',
    owner: 'frontend',
    effort: 'basso',
    confidence: 0.98,
  },
  'html-lang-valid': {
    title: 'Codice di lingua non valido',
    description: 'La lingua è dichiarata ma con un codice che le tecnologie assistive non riconoscono.',
    remediation: 'Usare un codice BCP 47 valido, per esempio "it" o "it-IT".',
    owner: 'frontend',
    effort: 'basso',
    confidence: 0.95,
  },
  label: {
    title: 'Campo di modulo senza etichetta',
    description:
      'Il campo non è associato a nessuna etichetta nel codice. Chi usa uno screen reader sente "casella di testo" senza sapere cosa inserirci.',
    remediation:
      'Associare una label al campo tramite l’attributo for, oppure racchiudere il campo dentro la label.',
    codeExample: '<label for="cf">Codice fiscale</label>\n<input id="cf" name="cf" type="text">',
    owner: 'frontend',
    effort: 'basso',
    confidence: 0.95,
  },
  'select-name': {
    title: 'Menu a tendina senza etichetta',
    description: 'Il menu di selezione non ha un nome accessibile: viene annunciato senza dire cosa si sta scegliendo.',
    remediation: 'Associare una label al select.',
    owner: 'frontend',
    effort: 'basso',
    confidence: 0.95,
  },
  'document-title': {
    title: 'Pagina senza titolo',
    description:
      'Manca il tag title. È la prima cosa che lo screen reader annuncia aprendo la pagina, e quella che identifica la scheda nel browser e nei preferiti.',
    remediation: 'Popolare il title con "Titolo del contenuto - Nome del sito".',
    owner: 'cms',
    effort: 'basso',
    confidence: 0.95,
  },
  'duplicate-id': {
    title: 'Identificatori duplicati nel codice',
    description:
      'Lo stesso id compare più volte. Le associazioni fra etichette e campi e i riferimenti ARIA puntano al primo elemento trovato, quindi qualcuno resta senza nome o ne riceve uno sbagliato.',
    remediation: 'Rendere univoco ogni id nella pagina; di solito il problema nasce da un componente ripetuto con id fisso.',
    owner: 'frontend',
    effort: 'medio',
    confidence: 0.9,
  },
  'duplicate-id-active': {
    title: 'Identificatori duplicati su elementi interattivi',
    description:
      'Due elementi interattivi condividono lo stesso id: le associazioni con le etichette e i riferimenti ARIA diventano ambigui.',
    remediation: 'Rendere univoci gli id, in particolare nei componenti ripetuti.',
    owner: 'frontend',
    effort: 'medio',
    confidence: 0.9,
  },
  'heading-order': {
    title: 'Gerarchia dei titoli non coerente',
    description:
      'I livelli dei titoli non seguono un ordine progressivo. Chi naviga saltando da un titolo all’altro percepisce sezioni mancanti.',
    remediation: 'Usare i livelli in sequenza, senza salti, e regolare la dimensione col CSS anziché cambiando livello.',
    owner: 'frontend',
    effort: 'basso',
    confidence: 0.85,
  },
  'landmark-one-main': {
    title: 'Manca l’area di contenuto principale',
    description:
      'La pagina non dichiara dove comincia il contenuto vero: chi usa uno screen reader deve riascoltare intestazione e menu a ogni pagina.',
    remediation: 'Racchiudere il contenuto principale in un elemento main, uno solo per pagina.',
    owner: 'frontend',
    effort: 'basso',
    confidence: 0.9,
  },
  region: {
    title: 'Contenuto fuori dalle aree strutturali',
    description:
      'Parte del contenuto non è dentro un landmark. Chi naviga per aree (intestazione, navigazione, contenuto, piè di pagina) se lo perde.',
    remediation: 'Assegnare ogni blocco di contenuto a un landmark appropriato: header, nav, main, aside, footer.',
    owner: 'frontend',
    effort: 'medio',
    confidence: 0.7,
  },
  bypass: {
    title: 'Manca un modo per saltare i blocchi ripetuti',
    description:
      'Non c’è modo di saltare menu e intestazione: chi naviga da tastiera li riattraversa integralmente a ogni cambio pagina.',
    remediation: 'Aggiungere un link "salta al contenuto" come primo elemento focalizzabile, e usare i landmark.',
    owner: 'frontend',
    effort: 'basso',
    confidence: 0.85,
  },
  list: {
    title: 'Struttura di elenco non valida',
    description:
      'Un elenco contiene elementi che non sono voci di lista. Lo screen reader annuncia il numero di voci in modo errato o perde la struttura.',
    remediation: 'Dentro ul e ol possono stare solo li (oltre a script e template).',
    owner: 'frontend',
    effort: 'basso',
    confidence: 0.9,
  },
  listitem: {
    title: 'Voce di elenco fuori da un elenco',
    description: 'Un li non è contenuto in un ul o ol: la struttura dell’elenco non viene riconosciuta.',
    remediation: 'Racchiudere le voci in un elemento ul o ol.',
    owner: 'frontend',
    effort: 'basso',
    confidence: 0.9,
  },
  'aria-required-attr': {
    title: 'Attributi ARIA obbligatori mancanti',
    description:
      'Un componente dichiara un ruolo ARIA ma non gli attributi che quel ruolo richiede: le tecnologie assistive non riescono a comunicarne lo stato.',
    remediation: 'Completare gli attributi richiesti dal ruolo, oppure - meglio - usare l’elemento HTML nativo equivalente.',
    owner: 'frontend',
    effort: 'medio',
    confidence: 0.9,
  },
  'aria-valid-attr-value': {
    title: 'Valore di attributo ARIA non valido',
    description:
      'Un attributo ARIA ha un valore che non esiste o punta a un id inesistente: l’informazione non arriva alle tecnologie assistive.',
    remediation: 'Correggere il valore e verificare che gli id referenziati esistano davvero nella pagina.',
    owner: 'frontend',
    effort: 'medio',
    confidence: 0.9,
  },
  'aria-hidden-focus': {
    title: 'Elemento nascosto ma raggiungibile da tastiera',
    description:
      'L’elemento è marcato come invisibile alle tecnologie assistive ma riceve comunque il focus. L’utente da tastiera ci finisce dentro senza che nulla venga annunciato.',
    remediation: 'Rendere l’elemento non focalizzabile con tabindex="-1" o l’attributo inert, coerentemente con aria-hidden.',
    owner: 'frontend',
    effort: 'medio',
    confidence: 0.9,
  },
  'nested-interactive': {
    title: 'Controlli interattivi annidati',
    description:
      'Un elemento interattivo ne contiene un altro (per esempio un pulsante dentro un link). Le tecnologie assistive non sanno quale annunciare e quale attivare.',
    remediation: 'Separare i controlli: mai un elemento attivabile dentro un altro.',
    owner: 'frontend',
    effort: 'medio',
    confidence: 0.9,
  },
  'frame-title': {
    title: 'Contenuto incorporato senza titolo',
    description:
      'Un iframe non ha un titolo: chi usa uno screen reader sente "frame" senza sapere cosa contiene (una mappa, un video, un modulo esterno).',
    remediation: 'Aggiungere l’attributo title all’iframe, descrivendo il contenuto incorporato.',
    codeExample: '<iframe src="…" title="Mappa della sede di via Esempio"></iframe>',
    owner: 'frontend',
    effort: 'basso',
    confidence: 0.95,
  },
  'meta-viewport': {
    title: 'Zoom della pagina bloccato',
    description:
      'Il viewport impedisce o limita l’ingrandimento. Per chi ha una vista ridotta lo zoom non è una preferenza ma la condizione per leggere.',
    remediation: 'Rimuovere user-scalable=no e non imporre maximum-scale sotto 5.',
    codeExample: '<meta name="viewport" content="width=device-width, initial-scale=1">',
    owner: 'frontend',
    effort: 'basso',
    confidence: 0.95,
  },
  'target-size': {
    title: 'Area cliccabile troppo piccola',
    description:
      'Il bersaglio è più piccolo della soglia minima: diventa difficile da colpire per chi ha tremore, ridotta motricità fine o usa il telefono in movimento.',
    remediation: 'Portare l’area interattiva ad almeno 24×24 pixel CSS, agendo sul padding più che sulla dimensione dell’icona.',
    owner: 'design',
    effort: 'basso',
    confidence: 0.85,
  },
  'scrollable-region-focusable': {
    title: 'Area scorrevole non raggiungibile da tastiera',
    description:
      'Un contenitore con scorrimento proprio non riceve il focus: da tastiera il suo contenuto è irraggiungibile.',
    remediation: 'Rendere il contenitore focalizzabile con tabindex="0" e dargli un nome accessibile.',
    owner: 'frontend',
    effort: 'basso',
    confidence: 0.8,
  },
  'autocomplete-valid': {
    title: 'Valore di autocomplete non valido',
    description:
      'Il campo dichiara un autocomplete che non rientra fra quelli previsti: la compilazione assistita non funziona.',
    remediation: 'Usare i valori previsti dalle specifiche HTML, per esempio "given-name", "email", "tel".',
    owner: 'frontend',
    effort: 'basso',
    confidence: 0.9,
  },
  'form-field-multiple-labels': {
    title: 'Campo con più etichette',
    description:
      'Al campo sono associate più etichette: a seconda del browser e dello screen reader ne viene letta una sola, e non sempre la stessa.',
    remediation: 'Tenere una sola label per campo e spostare il resto in aria-describedby.',
    owner: 'frontend',
    effort: 'basso',
    confidence: 0.85,
  },
  'td-headers-attr': {
    title: 'Riferimenti di tabella non validi',
    description:
      'Le celle rimandano a intestazioni che non esistono: in una tabella complessa si perde la relazione fra dato e intestazione.',
    remediation: 'Verificare che ogni valore di headers corrisponda all’id di una cella di intestazione presente.',
    owner: 'frontend',
    effort: 'medio',
    confidence: 0.9,
  },
  'th-has-data-cells': {
    title: 'Intestazione di tabella senza dati associati',
    description:
      'Un’intestazione non governa alcuna cella: spesso è il segno di una tabella usata per impaginare anziché per presentare dati.',
    remediation: 'Se la tabella serve solo al layout, sostituirla con CSS; se presenta dati, correggere la struttura di intestazioni e celle.',
    owner: 'frontend',
    effort: 'medio',
    confidence: 0.8,
  },
  'svg-img-alt': {
    title: 'Immagine SVG senza alternativa testuale',
    description: 'Un SVG con ruolo di immagine non ha un nome accessibile: il suo contenuto informativo non arriva.',
    remediation: 'Aggiungere un elemento title dentro l’SVG oppure un aria-label sull’elemento svg.',
    owner: 'frontend',
    effort: 'basso',
    confidence: 0.9,
  },
  'role-img-alt': {
    title: 'Elemento con ruolo immagine senza alternativa',
    description: 'L’elemento dichiara role="img" ma non ha un nome accessibile.',
    remediation: 'Aggiungere aria-label o aria-labelledby.',
    owner: 'frontend',
    effort: 'basso',
    confidence: 0.9,
  },
  'object-alt': {
    title: 'Contenuto incorporato senza alternativa',
    description: 'Un elemento object non ha un testo alternativo che ne descriva il contenuto.',
    remediation: 'Fornire un testo alternativo dentro l’elemento object o un aria-label.',
    owner: 'frontend',
    effort: 'basso',
    confidence: 0.85,
  },
  'input-image-alt': {
    title: 'Pulsante immagine senza alternativa',
    description: 'Un input di tipo image non ha alt: il pulsante viene annunciato senza dire cosa fa.',
    remediation: 'Aggiungere l’attributo alt descrivendo l’azione del pulsante.',
    owner: 'frontend',
    effort: 'basso',
    confidence: 0.95,
  },
  'meta-refresh': {
    title: 'Ricaricamento automatico della pagina',
    description:
      'La pagina si aggiorna o reindirizza da sola. Chi legge lentamente, chi usa uno screen reader o chi sta compilando un modulo viene interrotto senza preavviso.',
    remediation: 'Rimuovere il refresh automatico, oppure renderlo controllabile dall’utente.',
    owner: 'frontend',
    effort: 'medio',
    confidence: 0.9,
  },
};

export function axeItalian(ruleId: string): RemediationTemplate | undefined {
  return AXE_IT[ruleId];
}
