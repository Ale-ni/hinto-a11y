/**
 * Identita' stabile dei componenti.
 *
 * E' la funzione piu' importante del motore, ed e' quella che si e' rotta alla
 * prima prova su un sito vero.
 *
 * Tutto il valore della pipeline poggia su una domanda: "questi due difetti
 * sono lo stesso problema?". La risposta e' una firma calcolata dal DOM. Se la
 * firma e' instabile, la deduplica non collassa nulla, il clustering non
 * riconosce i template e il confronto fra scansioni successive e' impossibile
 * perche' ogni finding risulta nuovo.
 *
 * Il fixture iniziale usava classi semantiche scritte a mano (.site-header,
 * .main-menu): il mondo in cui questo approccio funziona sempre. Il primo sito
 * reale era un'applicazione React con CSS-in-JS, dove i nomi delle classi sono
 * hash rigenerati a ogni build: su 128 classi osservate, 108 erano hash. Con
 * quelle dentro la firma, lo stesso componente produceva undici firme diverse.
 *
 * La soluzione non e' un elenco di pattern di hash - e' una corsa persa contro
 * i generatori. Il segnale robusto e' statistico: sondiamo gia' piu' pagine,
 * quindi possiamo osservare QUALI CLASSI RICORRONO. Una classe presente su
 * otto pagine descrive una struttura; una presente su una sola pagina e'
 * quasi sempre generata. Il filtro sintattico resta come primo sbarramento
 * a basso costo, ma la frequenza e' ciò che decide.
 */

/* ------------------------------------------------------------------ *
 * Filtro sintattico
 * ------------------------------------------------------------------ */

/** Prefissi noti dei generatori di CSS-in-JS. */
const GENERATED_PREFIX = /^(sc-[a-z0-9]{4,}|css-[a-z0-9]{4,}|emotion-|jsx-\d+|svelte-[a-z0-9]{5,}|v-[0-9a-f]{6,})/i;

/** Stati transitori e hash esadecimali. */
const VOLATILE = /(^|-)(\d{2,}|[0-9a-f]{8,}|active|open|current|selected|hover|focus|visible|hidden|loaded|js-)/i;

/**
 * Forma tipica di un hash alfanumerico generato: nessun separatore, lunghezza
 * breve, maiuscole e minuscole mescolate. Esempi reali osservati su un sito in
 * produzione: lllLHB, gLCaMm, bPratC, cOVFKh, jfoksu.
 *
 * Il rischio di falsi positivi esiste - "navMain" scritta a mano ha la stessa
 * forma - ed e' il motivo per cui questo filtro da solo non basta e la
 * frequenza fra pagine ha l'ultima parola.
 */
export function looksGenerated(cls: string): boolean {
  return GENERATED_PREFIX.test(cls);
}

/**
 * Una classe senza separatori non e' giudicabile a vista.
 *
 * Il tentativo precedente contava i cambi di maiuscola/minuscola, e falliva in
 * due modi su casi reali: gli hash tutti minuscoli (`jfoksu`, `jfoksm`) non ne
 * hanno nessuno, e il conteggio con regex globale ne perdeva meta' perche' le
 * corrispondenze non si sovrappongono (`ekxyAo` ne contava uno invece di due).
 * Su dieci hash osservati in produzione, otto passavano il filtro.
 *
 * Una parola vera (`container`, `wrapper`, `card`) e un hash (`jfoksu`) sono
 * indistinguibili per forma. Quello che li distingue davvero e' l'uso: la
 * parola vera ricorre su gran parte del sito, l'hash su una pagina o due.
 * Quindi per queste classi la frequenza non e' un controllo aggiuntivo, e'
 * l'unico criterio - e la soglia dev'essere alta.
 */
export function needsStrongEvidence(cls: string): boolean {
  return !cls.includes('-') && !cls.includes('_');
}

/**
 * Valori che finiscono nell'attributo class per un errore di template, non per
 * una scelta di progettazione: `class={cond && 'x'}` che rende `false`, una
 * variabile non definita, un null interpolato. Non descrivono niente e
 * cambiano da pagina a pagina.
 *
 * Osservati davvero: `div.false` nell'header di un sito in produzione.
 */
const JUNK_LITERAL = new Set(['false', 'true', 'undefined', 'null', 'nan', 'none', 'object']);

/** Nessuna vocale: non e' una parola, e' una stringa generata. */
function hasNoVowel(cls: string): boolean {
  return !/[aeiouy]/i.test(cls);
}

/**
 * Forma di hash in una classe senza separatori.
 *
 * Questa funzione e' stata sbagliata due volte, ed entrambe le volte perche'
 * calibrata sugli hash di UN solo sito. La versione precedente pretendeva
 * ALMENO DUE maiuscole interne, tarata su `ciSEfC`, `bLurJE`, `cjKTwH`. Sul
 * sito successivo gli hash di styled-components erano questi:
 *
 *   jxpyrS  cbrjlW  dfgimQ  dseclZ  dseclY  ekxyAo  blmmAh  kqJkbv  kKfmzi
 *
 * Nove hash, tutti con UNA sola maiuscola. La regola precedente non ne
 * scartava nemmeno uno, e il ricalcolo su quella scansione cambiava zero firme.
 *
 * I tre segnali qui sotto, misurati sulle venti classi senza separatori di quel
 * sito, separano perfettamente le tredici generate (`ekxyAo`, `crhcdd`,
 * `mhbfv`, `false`, ...) dalle sette scritte a mano (`sezione`, `pixel`,
 * `small`, `red`, `blue`, `green`, `big`):
 *
 *   - una maiuscola interna: chi scrive a mano una classe senza separatori la
 *     scrive minuscola; il camelCase si usa in JavaScript, non nel CSS;
 *   - nessuna vocale: `crhcdd`, `mhbfv` non sono parole di nessuna lingua;
 *   - letterale spazzatura: `false` e parenti.
 *
 * Resta una regola euristica su un campione di due siti. Per questo non decide
 * da sola: la copertura fra pagine ha comunque l'ultima parola, e l'autodiagnosi
 * segnala gli identificatori sospetti che dovessero passare lo stesso.
 */
export function looksLikeHashedWord(cls: string): boolean {
  if (JUNK_LITERAL.has(cls.toLowerCase())) return true;
  if (/[A-Z]/.test(cls.slice(1))) return true;
  return hasNoVowel(cls);
}

/** Vale a prescindere dai separatori: `sc-false` non e' piu' informativo di `false`. */
export function isJunkLiteral(cls: string): boolean {
  return JUNK_LITERAL.has(cls.toLowerCase());
}

/** Primo sbarramento, senza conoscere la frequenza. */
export function syntacticallyStable(cls: string): boolean {
  if (!cls || cls.length > 40) return false;
  if (isJunkLiteral(cls)) return false;
  if (VOLATILE.test(cls)) return false;
  if (looksGenerated(cls)) return false;
  return true;
}

/* ------------------------------------------------------------------ *
 * Registro di frequenza
 * ------------------------------------------------------------------ */

/** classe -> numero di pagine distinte in cui compare */
export type ClassRegistry = Record<string, number>;

export function buildRegistry(perPageClasses: string[][]): ClassRegistry {
  const reg: ClassRegistry = {};
  for (const classes of perPageClasses) {
    for (const cls of new Set(classes)) {
      reg[cls] = (reg[cls] ?? 0) + 1;
    }
  }
  return reg;
}

export interface StabilityOptions {
  /** Pagine distinte in cui una classe con separatori deve comparire */
  minPages: number;
  /**
   * Quota di pagine sondate richiesta alle classi SENZA separatori, che sono
   * quelle indistinguibili a vista da un hash.
   */
  minCoverageForBareWords: number;
  /** Numero di pagine sondate: serve a non applicare le soglie su campioni minuscoli */
  sampledPages: number;
}

/**
 * Decide l'insieme delle classi utilizzabili nelle firme.
 *
 * La regola combina i due segnali: una classe passa se non ha l'aspetto di un
 * hash E ricorre su piu' pagine. Su campioni piccolissimi (una o due pagine)
 * la frequenza non e' informativa e ci si affida al solo filtro sintattico,
 * altrimenti su un sito di tre pagine non resterebbe nessuna classe.
 */
export function resolveStableClasses(
  registry: ClassRegistry,
  opts: StabilityOptions,
): Set<string> {
  const stable = new Set<string>();
  const useFrequency = opts.sampledPages >= 3;

  for (const [cls, pages] of Object.entries(registry)) {
    if (!syntacticallyStable(cls)) continue;
    if (!useFrequency) {
      stable.add(cls);
      continue;
    }
    if (needsStrongEvidence(cls)) {
      if (looksLikeHashedWord(cls)) continue;
      if (pages / opts.sampledPages < opts.minCoverageForBareWords) continue;
    } else if (pages < opts.minPages) {
      continue;
    }
    stable.add(cls);
  }
  return stable;
}

export const DEFAULT_STABILITY: Omit<StabilityOptions, 'sampledPages'> = {
  minPages: 2,
  minCoverageForBareWords: 0.4,
};

/* ------------------------------------------------------------------ *
 * Identificatori
 * ------------------------------------------------------------------ */

/**
 * Un id e' unico dentro la pagina, quindi identifica UN elemento - non uno
 * slot strutturale. Vale come identita' solo se lo stesso id ricorre su una
 * quota significativa delle pagine, cioe' se appartiene al guscio o al
 * template e non al contenuto.
 *
 * La distinzione non e' teorica. Su un sito reale, `describe` preferisce l'id
 * alla classe, e i CMS costruiscono gli id dal titolo della sezione:
 *
 *   div#section-accordion-il_potere_del_come   (1 pagina su 88)
 *   div#section-accordion-the_power_of_how     (1 pagina su 88)
 *   div#sezione-lista-eventi                   (2 pagine su 88)
 *
 * Lo stesso componente produceva cosi' una firma per pagina, e la versione
 * inglese di una pagina risultava un problema diverso da quella italiana. Con
 * l'id scartato la firma ripiega sulla classe strutturale (`div.sezione`) e i
 * duplicati collassano.
 *
 * La forma dell'id non aiuta a decidere: `uw-skip-to-main` ha lo stesso
 * aspetto di `sezione-lista-eventi` ma e' il pulsante di UserWay, presente su
 * 58 pagine su 88. Solo la frequenza separa i due casi.
 */
export function resolveStableIds(
  registry: ClassRegistry,
  opts: { sampledPages: number; minCoverage?: number },
): Set<string> {
  const minCoverage = opts.minCoverage ?? 0.3;
  const stable = new Set<string>();
  // su campioni minuscoli la frequenza non e' informativa
  const useFrequency = opts.sampledPages >= 4;
  for (const [id, pages] of Object.entries(registry)) {
    if (!id || id.length > 60) continue;
    if (isJunkLiteral(id)) continue;
    if (useFrequency && pages / opts.sampledPages < minCoverage) continue;
    stable.add(id);
  }
  return stable;
}

/**
 * Diagnostica per il report tecnico: quanto e' "ostile" il sito all'analisi
 * strutturale. Su un sito con classi semantiche sara' vicino a zero; su una
 * applicazione React con CSS-in-JS vicino a uno. Serve a spiegare al team
 * perche' su certi siti la firma ripiega sul percorso strutturale.
 */
export function generatedRatio(registry: ClassRegistry, stable: Set<string>): number {
  const all = Object.keys(registry);
  if (all.length === 0) return 0;
  const gen = all.filter((c) => !stable.has(c)).length;
  return Math.round((gen / all.length) * 100) / 100;
}
