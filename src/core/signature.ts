/**
 * Calcolo della firma del componente — in Node, non nel browser.
 *
 * E' una scelta di TESTABILITA', presa dopo aver dovuto chiedere tre volte
 * all'utente di rilanciare una scansione reale per validare tre correzioni
 * alla stessa funzione.
 *
 * Finche' la firma si calcolava dentro la pagina, l'unico modo di verificare
 * una modifica era rieseguire la scansione: crawl, browser, rete, minuti di
 * attesa, e un carico sul sito del cliente. Un ciclo di feedback del genere
 * e' inaccettabile per la funzione piu' soggetta a bug dell'intero motore.
 *
 * Ora il browser raccoglie soltanto il MATERIALE GREZZO - la catena di
 * antenati con tag, classi, id e ruoli - e lo conserva dentro l'evidenza.
 * La firma la compone questa funzione pura, che gira in Node e si puo':
 *
 *   - testare su casi sintetici in millisecondi
 *   - rieseguire su una scansione salvata con `a11y replay`, sui dati veri
 *     del cliente, senza toccare la rete
 *   - correggere e riverificare senza far rilanciare niente a nessuno
 *
 * E' lo stesso principio che regge gia' i check ("producono osservazioni, non
 * verdetti"), applicato un livello piu' in basso: il browser osserva, Node
 * giudica.
 */

/** Un antenato, come osservato nella pagina. Nessun giudizio. */
export interface AncestorNode {
  tag: string;
  classes: string[];
  id?: string;
  role?: string;
  /** Valore di un attributo di test (data-testid e simili) */
  testAttr?: string;
  /** Questo nodo e' il landmark contenitore */
  landmark?: boolean;
}

/** Materiale grezzo raccolto dalla pagina per un singolo elemento. */
export interface SignatureInput {
  /** Dall'elemento verso l'alto, fino al landmark incluso */
  chain: AncestorNode[];
  /** Nome del fornitore, se l'elemento appartiene a un widget di terze parti */
  vendor?: string;
}

const GENERATED_ID = /^(:|[0-9a-f]{8,})/i;

/**
 * Fornitori riconoscibili dai soli nomi di classe e id, cioe' da cio' che la
 * catena di antenati conserva.
 *
 * Il riconoscimento avviene gia' nel browser, dove `closest` puo' guardare
 * anche `iframe[src]`. Questo secondo passaggio in Node esiste per una ragione
 * di ciclo di feedback, non di copertura: l'elenco dei fornitori e' per forza
 * incompleto - Google Maps incorporata via JS API e' stata scoperta al secondo
 * sito - e senza questo passaggio ogni aggiunta all'elenco imporrebbe di
 * rifare le scansioni gia' eseguite. Cosi' invece basta `replay`.
 */
const CHAIN_VENDORS: Array<[string, RegExp]> = [
  ['Google Maps', /^(gm-|gmp-|gmnoprint)/],
  ['reCAPTCHA', /^(grecaptcha|g-recaptcha)/],
  ['UserWay', /userway|^uw-/],
  ['AccessiBe', /^acsb/],
  ['Cookiebot', /^CybotCookiebot/i],
  ['HubSpot', /^(hs-form|hbspt)/],
  ['Intercom', /^intercom-/],
  ['Crisp', /^crisp-client/],
  ['Calendly', /^calendly-/],
  ['Trustpilot', /^trustpilot-/],
];

/** Fornitore dedotto dalla catena, quando il browser non l'ha riconosciuto. */
function vendorFromChain(chain: AncestorNode[]): string | undefined {
  for (const node of chain) {
    const tokens = [...node.classes, ...(node.id ? [node.id] : [])];
    for (const [name, pattern] of CHAIN_VENDORS) {
      if (tokens.some((t) => pattern.test(t))) return name;
    }
  }
  return undefined;
}

function usableId(id: string | undefined, stableIds?: Set<string>): boolean {
  if (!id) return false;
  if (id.includes(':')) return false; // React useId: ":r0:"
  if (GENERATED_ID.test(id)) return false;
  // Se il registro c'e', un id vale solo se ricorre: vedi resolveStableIds.
  if (stableIds && !stableIds.has(id)) return false;
  return true;
}

/** Descrittore di un singolo nodo, con catena di ripiego. */
function describe(node: AncestorNode, stable: Set<string>, stableIds?: Set<string>): string {
  const tag = node.tag.toLowerCase();
  if (node.testAttr) return `${tag}[${node.testAttr}]`;
  if (usableId(node.id, stableIds)) return `${tag}#${node.id}`;
  const cls = node.classes.find((c) => stable.has(c));
  if (cls) return `${tag}.${cls}`;
  return tag + (node.role ? `[${node.role}]` : '');
}

/**
 * Un contenitore anonimo e' rumore di impaginazione, non identita'.
 *
 * Lo stesso campo puo' stare in "form > div > div > input" su una pagina e in
 * "form > div > div > div > input" su un'altra, per un wrapper in piu' deciso
 * dal framework. Due firme diverse producono due voci identiche nel backlog,
 * con lo stesso conteggio di occorrenze - il sintomo da cui si riconosce il
 * problema. Un div senza classi utili, senza id e senza ruolo non identifica
 * nulla: si salta.
 */
function isAnonymousWrapper(node: AncestorNode, desc: string): boolean {
  const tag = node.tag.toUpperCase();
  if (tag !== 'DIV' && tag !== 'SPAN' && tag !== 'SECTION') return false;
  return desc === node.tag.toLowerCase();
}

/**
 * Compone la firma. E' la chiave su cui il motore decide se due difetti sono
 * lo stesso problema, quindi deve restare identica fra pagine diverse, fra
 * siti che condividono il tema, e fra build successive del sito.
 *
 * Volutamente SENZA posizione nell'elenco: il terzo link di una lista e il
 * quindicesimo devono collassare insieme.
 */
export function computeSignature(
  input: SignatureInput,
  stableClasses: Set<string>,
  stableIds?: Set<string>,
): string {
  const vendor = input.vendor ?? vendorFromChain(input.chain);
  if (vendor) return `terze-parti:${vendor}`;
  if (!input.chain.length) return 'unknown';

  // la catena arriva dall'elemento verso l'alto: l'ultimo e' il landmark
  const chain = [...input.chain];
  const landmarkNode = chain[chain.length - 1]?.landmark ? chain.pop() : undefined;
  const landmark = landmarkNode ? describe(landmarkNode, stableClasses, stableIds) : 'body';

  const parts: string[] = [];
  chain.forEach((node, index) => {
    const desc = describe(node, stableClasses, stableIds);
    // index 0 e' l'elemento stesso: non si salta mai
    if (index === 0 || !isAnonymousWrapper(node, desc)) parts.unshift(desc);
  });

  return `${landmark} > ${parts.join(' > ')}`;
}

/** Decodifica il materiale raccolto dal browser, tollerando i formati vecchi. */
export function parseSignatureInput(raw: string): SignatureInput | null {
  if (!raw || raw[0] !== '{') return null;
  try {
    const parsed = JSON.parse(raw) as SignatureInput;
    if (!parsed || !Array.isArray(parsed.chain)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Ricalcolo su scansioni prodotte da versioni precedenti
 * ------------------------------------------------------------------ */

/** I soli descrittori che `describe` produce per un contenitore anonimo. */
const ANONYMOUS_DESC = new Set(['div', 'span', 'section']);

/** `describe` emette al massimo UNA classe, quindi la forma e' `tag.classe`. */
function stripClass(desc: string, dropClass: (cls: string) => boolean): string {
  const m = /^([^.#[]+)\.(.+)$/.exec(desc);
  if (!m) return desc;
  return dropClass(m[2]) ? m[1] : desc;
}

/**
 * Ricostruisce la firma partendo da quella gia' composta, quando il materiale
 * grezzo non e' disponibile.
 *
 * Serve a non buttare via le scansioni fatte prima della 0.3.0: sono ore di
 * esecuzione e traffico sul sito del cliente, e contengono gli unici dati veri
 * su cui valga la pena validare una correzione.
 *
 * Non e' un'approssimazione per questa transizione. Le regole nuove sono
 * strettamente piu' restrittive delle vecchie - scartano classi in piu' e
 * collassano contenitori in piu', non ne recuperano nessuno - quindi applicarle
 * alla stringa composta da' lo stesso risultato che si otterrebbe applicandole
 * alla catena grezza. Vale finche' questa condizione regge: se una regola
 * futura dovesse riammettere qualcosa, questa scorciatoia non sarebbe piu'
 * lecita e servirebbe il materiale grezzo.
 */
export function rederiveFromComposed(
  composed: string,
  dropClass: (cls: string) => boolean,
): string {
  if (!composed || composed.startsWith('terze-parti:')) return composed;

  const CONSENT = 'banner-consenso > ';
  const prefix = composed.startsWith(CONSENT) ? CONSENT : '';
  const parts = composed.slice(prefix.length).split(' > ');
  if (parts.length < 2) return composed;

  const landmark = stripClass(parts[0], dropClass);
  const chain = parts.slice(1).map((d) => stripClass(d, dropClass));
  // l'ultimo e' l'elemento stesso: non si salta mai
  const kept = chain.filter(
    (desc, i) => i === chain.length - 1 || !ANONYMOUS_DESC.has(desc),
  );

  return `${prefix}${landmark} > ${kept.join(' > ')}`;
}

/**
 * Risolve la firma a partire da cio' che e' finito nell'evidenza.
 *
 * Se il materiale grezzo c'e', ricalcola; altrimenti restituisce il valore
 * cosi' com'e'. La tolleranza serve a poter rileggere scansioni prodotte da
 * versioni precedenti del motore senza che `replay` si rompa.
 */
export function resolveSignature(
  raw: string,
  stableClasses: Set<string>,
  stableIds?: Set<string>,
): string {
  const input = parseSignatureInput(raw);
  if (!input) return raw;
  return computeSignature(input, stableClasses, stableIds);
}
