/**
 * Catalogo dei criteri WCAG 2.1 livello A e AA (i 50 criteri che compongono
 * la baseline normativa italiana via EN 301 549 v3.2.1).
 *
 * Nota sullo standard: le Linee Guida AgID rimandano alla norma armonizzata
 * EN 301 549, che ad oggi referenzia WCAG 2.1. I criteri introdotti da
 * WCAG 2.2 sono raccomandazione forward-looking, NON baseline di conformita':
 * dichiararli come non conformita' produce un backlog che il cliente puo'
 * legittimamente contestare. Vivono in `WCAG22_ADDITIONS`, separati.
 *
 * Il campo `automation` e' la regola di ingaggio del motore:
 *   deterministic -> il motore puo' emettere `fail` da solo
 *   partial       -> il motore restringe il campo, l'esito massimo e' `needs-review`
 *   judgment      -> nessun automatismo, solo protocollo manuale
 */
import type { WcagCriterion } from './types.js';

type C = WcagCriterion;

const c = (
  id: string,
  title: string,
  level: C['level'],
  principle: C['principle'],
  automation: C['automation'],
  plainLanguage: string,
  affectedUsers: string[],
): C => ({ id, title, level, principle, automation, plainLanguage, affectedUsers });

const NV = 'utenti non vedenti';
const IV = 'utenti ipovedenti';
const DALT = 'utenti daltonici';
const MOT = 'utenti con disabilita motorie';
const SORD = 'utenti sordi o ipoudenti';
const COGN = 'utenti con disabilita cognitive';
const VEST = 'utenti con disturbi vestibolari';
const EPIL = 'utenti con epilessia fotosensibile';
const TAST = 'utenti che navigano da tastiera';
const SR = 'utenti di screen reader';

/* ------------------------------------------------------------------ *
 * 1. Percepibile
 * ------------------------------------------------------------------ */
const PERCEPIBILE: C[] = [
  c('1.1.1', 'Contenuti non testuali', 'A', 'percepibile', 'partial',
    'Ogni immagine, icona o contenuto non testuale deve avere un\'alternativa testuale che ne comunichi lo scopo. La macchina verifica che l\'alternativa ci sia; se sia utile lo decide una persona.',
    [NV, SR, IV]),
  c('1.2.1', 'Solo audio e solo video (preregistrato)', 'A', 'percepibile', 'judgment',
    'Un contenuto di solo audio deve avere una trascrizione; un video senza audio deve avere una descrizione equivalente.',
    [NV, SORD]),
  c('1.2.2', 'Sottotitoli (preregistrato)', 'A', 'percepibile', 'partial',
    'I video con audio devono avere sottotitoli sincronizzati. Il motore rileva la presenza di tracce, non la loro correttezza.',
    [SORD]),
  c('1.2.3', 'Audiodescrizione o alternativa testuale (preregistrato)', 'A', 'percepibile', 'judgment',
    'Il contenuto visivo di un video deve essere disponibile anche come descrizione audio o testo.',
    [NV]),
  c('1.2.4', 'Sottotitoli (in diretta)', 'AA', 'percepibile', 'judgment',
    'Le dirette con audio devono avere sottotitoli in tempo reale.',
    [SORD]),
  c('1.2.5', 'Audiodescrizione (preregistrato)', 'AA', 'percepibile', 'judgment',
    'I video preregistrati devono avere una traccia di audiodescrizione.',
    [NV]),
  c('1.3.1', 'Informazioni e correlazioni', 'A', 'percepibile', 'partial',
    'La struttura visiva deve esistere anche nel codice: un titolo deve essere un heading, una tabella dati deve avere intestazioni, un elenco deve essere una lista. Se l\'aspetto comunica qualcosa, il markup deve comunicarlo allo stesso modo.',
    [NV, SR, COGN]),
  c('1.3.2', 'Sequenza significativa', 'A', 'percepibile', 'partial',
    'L\'ordine di lettura del codice deve avere senso quanto quello visivo: chi usa uno screen reader legge nell\'ordine del DOM, non in quello del CSS.',
    [NV, SR, TAST]),
  c('1.3.3', 'Caratteristiche sensoriali', 'A', 'percepibile', 'judgment',
    'Le istruzioni non possono basarsi solo su forma, colore, posizione o suono ("clicca il pulsante tondo a destra").',
    [NV, IV, DALT, COGN]),
  c('1.3.4', 'Orientamento', 'AA', 'percepibile', 'deterministic',
    'Il contenuto non deve essere bloccato in verticale o orizzontale, salvo casi essenziali.',
    [MOT, IV]),
  c('1.3.5', 'Identificazione dello scopo dell\'input', 'AA', 'percepibile', 'deterministic',
    'I campi che raccolgono dati dell\'utente (nome, email, telefono) devono dichiararlo con l\'attributo autocomplete, per consentire la compilazione assistita.',
    [COGN, MOT]),
  c('1.4.1', 'Uso del colore', 'A', 'percepibile', 'partial',
    'Il colore non puo\' essere l\'unico modo per trasmettere un\'informazione: un link dentro un paragrafo deve distinguersi anche senza colore, un errore non puo\' essere solo rosso.',
    [DALT, NV, IV]),
  c('1.4.2', 'Controllo dell\'audio', 'A', 'percepibile', 'partial',
    'Un audio che parte da solo e dura piu\' di 3 secondi deve poter essere fermato.',
    [SR, COGN]),
  c('1.4.3', 'Contrasto (minimo)', 'AA', 'percepibile', 'deterministic',
    'Il testo deve avere un rapporto di contrasto di almeno 4.5:1 rispetto allo sfondo (3:1 se il testo e\' grande).',
    [IV, DALT, 'utenti anziani']),
  c('1.4.4', 'Ridimensionamento del testo', 'AA', 'percepibile', 'partial',
    'Il testo deve restare leggibile e funzionante fino al 200% di ingrandimento, senza perdita di contenuto.',
    [IV]),
  c('1.4.5', 'Immagini di testo', 'AA', 'percepibile', 'partial',
    'Il testo deve essere testo reale, non un\'immagine che lo rappresenta, salvo logo e casi essenziali.',
    [IV, NV, SR]),
  c('1.4.10', 'Riflusso', 'AA', 'percepibile', 'deterministic',
    'A 320px di larghezza il contenuto deve rifloware su una colonna sola, senza scroll orizzontale.',
    [IV, MOT]),
  c('1.4.11', 'Contrasto del contenuto non testuale', 'AA', 'percepibile', 'partial',
    'Bordi dei campi, icone informative e indicatori di stato devono avere almeno 3:1 di contrasto.',
    [IV, DALT]),
  c('1.4.12', 'Spaziatura del testo', 'AA', 'percepibile', 'deterministic',
    'Se l\'utente aumenta interlinea e spaziatura, il testo non deve essere tagliato o sovrapposto.',
    [IV, COGN, 'utenti dislessici']),
  c('1.4.13', 'Contenuto in hover o focus', 'AA', 'percepibile', 'partial',
    'Tooltip e menu a comparsa devono poter essere chiusi, restare visibili mentre ci si passa sopra e non sparire da soli.',
    [IV, MOT, TAST]),
];

/* ------------------------------------------------------------------ *
 * 2. Utilizzabile
 * ------------------------------------------------------------------ */
const UTILIZZABILE: C[] = [
  c('2.1.1', 'Tastiera', 'A', 'utilizzabile', 'partial',
    'Tutto cio\' che si fa col mouse deve essere possibile da tastiera. E\' il criterio piu\' violato dai componenti custom (slider, dropdown, mappe).',
    [TAST, MOT, NV, SR]),
  c('2.1.2', 'Nessuna trappola per la tastiera', 'A', 'utilizzabile', 'deterministic',
    'Non ci si deve poter incastrare in un elemento senza riuscire a uscirne con la tastiera.',
    [TAST, MOT, NV]),
  c('2.1.4', 'Scorciatoie da tastiera con caratteri', 'A', 'utilizzabile', 'partial',
    'Le scorciatoie a tasto singolo devono poter essere disattivate o rimappate.',
    [MOT, 'utenti di comandi vocali']),
  c('2.2.1', 'Regolazione dei tempi', 'A', 'utilizzabile', 'judgment',
    'Se c\'e\' un limite di tempo, l\'utente deve poterlo estendere o disattivare.',
    [COGN, MOT, IV]),
  c('2.2.2', 'Pausa, stop, nascondi', 'A', 'utilizzabile', 'partial',
    'Caroselli, animazioni e contenuti che si aggiornano da soli devono avere un comando di pausa.',
    [COGN, VEST, IV]),
  c('2.3.1', 'Tre lampeggiamenti o inferiore alla soglia', 'A', 'utilizzabile', 'judgment',
    'Niente deve lampeggiare piu\' di tre volte al secondo: puo\' provocare crisi epilettiche.',
    [EPIL]),
  c('2.4.1', 'Salto di blocchi', 'A', 'utilizzabile', 'partial',
    'Deve esserci un modo per saltare direttamente al contenuto, senza ritabulare tutto il menu a ogni pagina.',
    [TAST, NV, SR, MOT]),
  c('2.4.2', 'Pagina titolata', 'A', 'utilizzabile', 'partial',
    'Ogni pagina deve avere un titolo descrittivo e univoco.',
    [NV, SR, COGN]),
  c('2.4.3', 'Ordine del focus', 'A', 'utilizzabile', 'partial',
    'Spostandosi col tasto Tab, l\'ordine deve seguire la logica del contenuto. Il motore ricostruisce il percorso; se sia logico lo giudica una persona.',
    [TAST, NV, MOT]),
  c('2.4.4', 'Scopo del link (nel contesto)', 'A', 'utilizzabile', 'partial',
    'Si deve capire dove porta un link. "Leggi tutto" ripetuto 40 volte non lo permette a chi naviga per elenco di link.',
    [NV, SR, COGN]),
  c('2.4.5', 'Piu\' modi', 'AA', 'utilizzabile', 'partial',
    'Deve esserci piu\' di un modo per raggiungere una pagina: menu, ricerca, mappa del sito.',
    [COGN, NV]),
  c('2.4.6', 'Intestazioni ed etichette', 'AA', 'utilizzabile', 'partial',
    'Titoli ed etichette devono descrivere davvero il contenuto a cui si riferiscono.',
    [NV, SR, COGN]),
  c('2.4.7', 'Focus visibile', 'AA', 'utilizzabile', 'deterministic',
    'Si deve sempre vedere dove si trova il focus della tastiera. Rimuovere l\'outline senza sostituirlo e\' la violazione piu\' frequente in assoluto.',
    [TAST, IV, MOT]),
  c('2.5.1', 'Gesti del puntatore', 'A', 'utilizzabile', 'judgment',
    'Le funzioni che richiedono gesti complessi (pinch, swipe multiplo) devono avere un\'alternativa a tocco singolo.',
    [MOT]),
  c('2.5.2', 'Annullamento del puntatore', 'A', 'utilizzabile', 'judgment',
    'L\'azione deve scattare al rilascio, non alla pressione, per poter annullare un click sbagliato.',
    [MOT, COGN]),
  c('2.5.3', 'Etichetta nel nome', 'A', 'utilizzabile', 'deterministic',
    'Il nome accessibile di un controllo deve contenere il testo visibile: altrimenti i comandi vocali non funzionano.',
    ['utenti di comandi vocali', MOT, SR]),
  c('2.5.4', 'Attivazione da movimento', 'A', 'utilizzabile', 'judgment',
    'Funzioni attivate scuotendo o inclinando il dispositivo devono avere un\'alternativa e poter essere disattivate.',
    [MOT]),
];

/* ------------------------------------------------------------------ *
 * 3. Comprensibile
 * ------------------------------------------------------------------ */
const COMPRENSIBILE: C[] = [
  c('3.1.1', 'Lingua della pagina', 'A', 'comprensibile', 'deterministic',
    'La pagina deve dichiarare la propria lingua, altrimenti lo screen reader la legge con la pronuncia sbagliata.',
    [NV, SR, COGN]),
  c('3.1.2', 'Lingua delle parti', 'AA', 'comprensibile', 'partial',
    'I brani in lingua diversa devono essere marcati come tali.',
    [NV, SR]),
  c('3.2.1', 'Al focus', 'A', 'comprensibile', 'partial',
    'Spostare il focus su un elemento non deve provocare cambi di contesto inattesi.',
    [TAST, COGN, NV]),
  c('3.2.2', 'All\'input', 'A', 'comprensibile', 'partial',
    'Compilare un campo non deve far succedere cose impreviste, come inviare il form o cambiare pagina.',
    [COGN, NV, TAST]),
  c('3.2.3', 'Navigazione coerente', 'AA', 'comprensibile', 'partial',
    'La navigazione deve stare nello stesso posto e nello stesso ordine su tutte le pagine. Su un ecosistema multi-sito e\' il criterio piu\' a rischio.',
    [COGN, NV, IV]),
  c('3.2.4', 'Identificazione coerente', 'AA', 'comprensibile', 'partial',
    'La stessa funzione deve chiamarsi allo stesso modo ovunque: non "Cerca" qui e "Trova" la\'.',
    [COGN, NV, SR]),
  c('3.3.1', 'Identificazione degli errori', 'A', 'comprensibile', 'partial',
    'Gli errori di compilazione devono essere descritti a parole, non solo segnalati col colore.',
    [NV, DALT, COGN]),
  c('3.3.2', 'Etichette o istruzioni', 'A', 'comprensibile', 'deterministic',
    'Ogni campo deve avere un\'etichetta associata nel codice. Il placeholder non e\' un\'etichetta.',
    [NV, SR, COGN]),
  c('3.3.3', 'Suggerimento per gli errori', 'AA', 'comprensibile', 'judgment',
    'Se il sistema sa come correggere l\'errore, deve dirlo.',
    [COGN, NV]),
  c('3.3.4', 'Prevenzione degli errori (legali, finanziari, dati)', 'AA', 'comprensibile', 'judgment',
    'Le operazioni con conseguenze devono essere reversibili, verificate o confermate.',
    [COGN, MOT, NV]),
];

/* ------------------------------------------------------------------ *
 * 4. Robusto
 * ------------------------------------------------------------------ */
const ROBUSTO: C[] = [
  c('4.1.1', 'Analisi sintattica', 'A', 'robusto', 'deterministic',
    'Markup valido: niente ID duplicati o tag annidati male. Criterio dichiarato obsoleto in WCAG 2.2, ma ancora formalmente in vigore con EN 301 549 v3.2.1.',
    [SR, NV]),
  c('4.1.2', 'Nome, ruolo, valore', 'A', 'robusto', 'partial',
    'Ogni controllo deve comunicare alle tecnologie assistive cosa e\', come si chiama e in che stato si trova. E\' il criterio che i componenti custom violano piu\' spesso.',
    [NV, SR, 'utenti di comandi vocali']),
  c('4.1.3', 'Messaggi di stato', 'AA', 'robusto', 'partial',
    'I messaggi che compaiono senza cambiare pagina (conferme, errori, risultati di ricerca) devono essere annunciati allo screen reader.',
    [NV, SR]),
];

export const WCAG21_AA: C[] = [
  ...PERCEPIBILE,
  ...UTILIZZABILE,
  ...COMPRENSIBILE,
  ...ROBUSTO,
];

/**
 * Criteri aggiunti da WCAG 2.2. NON fanno parte della baseline di conformita'
 * finche' la Commissione non aggiorna la norma armonizzata: vanno riportati
 * come raccomandazione, mai come non conformita'.
 */
export const WCAG22_ADDITIONS: C[] = [
  c('2.4.11', 'Focus non oscurato (minimo)', 'AA', 'utilizzabile', 'deterministic',
    'L\'elemento che ha il focus non deve essere completamente nascosto da header sticky o banner cookie.',
    [TAST, IV, MOT]),
  c('2.5.7', 'Trascinamento', 'AA', 'utilizzabile', 'judgment',
    'Ogni funzione basata sul trascinamento deve avere un\'alternativa a click singolo.',
    [MOT]),
  c('2.5.8', 'Dimensione del target (minimo)', 'AA', 'utilizzabile', 'deterministic',
    'Le aree cliccabili devono essere almeno 24x24 pixel CSS.',
    [MOT, 'utenti da mobile']),
  c('3.2.6', 'Aiuto coerente', 'A', 'comprensibile', 'partial',
    'I meccanismi di aiuto devono comparire nello stesso posto su tutte le pagine.',
    [COGN]),
  c('3.3.7', 'Inserimento ridondante', 'A', 'comprensibile', 'judgment',
    'Non si devono chiedere due volte le stesse informazioni nella stessa procedura.',
    [COGN, MOT]),
  c('3.3.8', 'Autenticazione accessibile (minimo)', 'AA', 'comprensibile', 'judgment',
    'Il login non puo\' richiedere test cognitivi come ricordare password a memoria o risolvere puzzle senza alternative.',
    [COGN, NV]),
];

const byId = new Map<string, C>(
  [...WCAG21_AA, ...WCAG22_ADDITIONS].map((x) => [x.id, x]),
);

export function getCriterion(id: string): C | undefined {
  return byId.get(id);
}

/** True se il criterio fa parte della baseline normativa vincolante. */
export function isBaseline(id: string): boolean {
  return WCAG21_AA.some((x) => x.id === id);
}

/**
 * Regola di ingaggio: quale verdetto massimo puo' emettere un automatismo
 * su questo criterio. Impedisce al motore di dichiarare conformita' o
 * fallimento su criteri che richiedono giudizio.
 */
export function maxAutomatedVerdict(criterionId: string): 'fail' | 'needs-review' {
  const crit = byId.get(criterionId);
  if (!crit) return 'needs-review';
  return crit.automation === 'deterministic' ? 'fail' : 'needs-review';
}

/** Peso di esposizione normativa: livello A pesa piu' di AA. */
export function legalWeight(criteriaIds: string[]): number {
  let max = 0;
  for (const id of criteriaIds) {
    const crit = byId.get(id);
    if (!crit) continue;
    if (!isBaseline(id)) {
      max = Math.max(max, 1); // WCAG 2.2: raccomandazione, esposizione minima
      continue;
    }
    max = Math.max(max, crit.level === 'A' ? 5 : 4);
  }
  return max || 2;
}

/** Mapping regola axe-core -> criteri WCAG, per le regole non taggate. */
export const AXE_RULE_OVERRIDES: Record<string, string[]> = {
  'color-contrast': ['1.4.3'],
  'color-contrast-enhanced': ['1.4.6'],
  'image-alt': ['1.1.1'],
  'input-image-alt': ['1.1.1'],
  'area-alt': ['1.1.1', '2.4.4'],
  'label': ['3.3.2', '4.1.2'],
  'link-name': ['2.4.4', '4.1.2'],
  'button-name': ['4.1.2'],
  'document-title': ['2.4.2'],
  'html-has-lang': ['3.1.1'],
  'html-lang-valid': ['3.1.1'],
  'valid-lang': ['3.1.2'],
  'duplicate-id': ['4.1.1'],
  'duplicate-id-active': ['4.1.1'],
  'duplicate-id-aria': ['4.1.1'],
  'heading-order': ['1.3.1'],
  'landmark-one-main': ['1.3.1'],
  'region': ['1.3.1'],
  'list': ['1.3.1'],
  'listitem': ['1.3.1'],
  'definition-list': ['1.3.1'],
  'td-headers-attr': ['1.3.1'],
  'th-has-data-cells': ['1.3.1'],
  'aria-required-attr': ['4.1.2'],
  'aria-required-children': ['1.3.1', '4.1.2'],
  'aria-required-parent': ['1.3.1', '4.1.2'],
  'aria-roles': ['4.1.2'],
  'aria-valid-attr': ['4.1.2'],
  'aria-valid-attr-value': ['4.1.2'],
  'aria-hidden-focus': ['1.3.1', '4.1.2'],
  'aria-allowed-attr': ['4.1.2'],
  'bypass': ['2.4.1'],
  'frame-title': ['2.4.1', '4.1.2'],
  'meta-viewport': ['1.4.4'],
  'meta-refresh': ['2.2.1'],
  'autocomplete-valid': ['1.3.5'],
  'avoid-inline-spacing': ['1.4.12'],
  'scrollable-region-focusable': ['2.1.1'],
  'tabindex': ['2.4.3'],
  'select-name': ['4.1.2'],
  'object-alt': ['1.1.1'],
  'video-caption': ['1.2.2'],
  'audio-caption': ['1.2.1'],
  'blink': ['2.2.2'],
  'marquee': ['2.2.2'],
  'server-side-image-map': ['2.1.1'],
  'nested-interactive': ['4.1.2'],
  'form-field-multiple-labels': ['3.3.2'],
  'aria-command-name': ['4.1.2'],
  'aria-input-field-name': ['4.1.2'],
  'aria-toggle-field-name': ['4.1.2'],
  'aria-meter-name': ['1.1.1'],
  'aria-progressbar-name': ['1.1.1'],
  'aria-tooltip-name': ['4.1.2'],
  'svg-img-alt': ['1.1.1'],
  'role-img-alt': ['1.1.1'],
  'target-size': ['2.5.8'],
};

/**
 * Estrae i criteri WCAG dai tag di una regola axe (es. "wcag143" -> "1.4.3").
 * Fa fallback sulla tabella di override quando i tag non bastano.
 */
export function criteriaFromAxeTags(ruleId: string, tags: string[]): string[] {
  const fromTags = tags
    .filter((t) => /^wcag\d{3,4}$/.test(t))
    .map((t) => {
      const digits = t.replace('wcag', '');
      // wcag143 -> 1.4.3 ; wcag1410 -> 1.4.10
      if (digits.length === 3) return `${digits[0]}.${digits[1]}.${digits[2]}`;
      return `${digits[0]}.${digits[1]}.${digits.slice(2)}`;
    });
  if (fromTags.length) return [...new Set(fromTags)];
  return AXE_RULE_OVERRIDES[ruleId] ?? [];
}
