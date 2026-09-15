/**
 * Varianti linguistiche dello stesso template.
 *
 * Su un sito multilingua la stessa pagina esiste in piu' lingue, costruita
 * dallo stesso template: `/it/blog/x` e `/en/blog/x` hanno la stessa
 * struttura, gli stessi componenti, gli stessi difetti strutturali. Su
 * hintogroup.eu questo raddoppiava il lavoro: dieci dei trentasette template
 * erano coppie italiano/inglese, e la scansione misurava due volte gli stessi
 * componenti.
 *
 * La tentazione sarebbe scansionare una sola lingua. Sarebbe sbagliato: le
 * differenze fra lingue esistono e sono proprio del tipo che un audit deve
 * trovare - un `alt` non tradotto, un `lang` non aggiornato, un testo inglese
 * che sfora il pulsante disegnato sull'italiano, un link "leggi di piu'"
 * rimasto in una lingua sola.
 *
 * Quindi non si salta: si CAMPIONA PIU' LEGGERO. La lingua principale mantiene
 * il campionamento pieno, le altre scendono a un controllo a campione. Se su
 * quel campione compare un difetto che nella lingua principale non c'e', il
 * motore lo segnala comunque - ed e' il segnale che quella lingua va guardata
 * per intero.
 */

/** Codici ISO 639-1 piu' i formati con regione. */
const LANG_SEGMENT = /^([a-z]{2})([-_][a-z]{2,4})?$/i;

/**
 * Lingue che compaiono davvero come segmento di percorso. L'elenco chiuso
 * evita di scambiare per lingua un segmento di due lettere che lingua non e'
 * (`/it/` e' italiano, ma `/hr/` potrebbe essere "human resources").
 */
const KNOWN = new Set([
  'it', 'en', 'fr', 'de', 'es', 'pt', 'nl', 'da', 'sv', 'no', 'fi', 'pl',
  'cs', 'sk', 'sl', 'hu', 'ro', 'bg', 'el', 'ru', 'uk', 'tr', 'ar', 'he',
  'zh', 'ja', 'ko', 'ca', 'eu', 'gl', 'ga', 'cy', 'et', 'lv', 'lt', 'sr',
  'hr', 'mt', 'is',
]);

export interface LanguageInfo {
  /** Codice lingua trovato nel percorso, in minuscolo */
  code: string;
  /** Il percorso con il segmento di lingua sostituito da un segnaposto */
  neutral: string;
}

/**
 * Estrae la lingua dal percorso di un URL, se e' nel primo segmento.
 *
 * Si guarda solo il primo segmento perche' e' la convenzione dominante e
 * perche' cercarla ovunque produce falsi positivi: `/prodotti/es/` non e'
 * spagnolo.
 */
export function languageOf(url: string): LanguageInfo | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = url;
  }
  const parts = pathname.split('/').filter(Boolean);
  if (!parts.length) return null;

  const m = LANG_SEGMENT.exec(parts[0]);
  if (!m) return null;
  const code = m[1].toLowerCase();
  if (!KNOWN.has(code)) return null;

  const rest = parts.slice(1);
  return { code, neutral: '/{lang}/' + rest.join('/') };
}

export interface TemplateLike {
  fingerprint: string;
  samples: string[];
  memberUrls: string[];
  pageCount: number;
}

export interface LanguageGrouping<T extends TemplateLike> {
  /** Template che mantengono il campionamento pieno */
  primary: T[];
  /** Template ridotti a controllo a campione, con la lingua che rappresentano */
  secondary: Array<{ template: T; code: string; primaryCode: string }>;
}

/** Lingua prevalente di un template: quella della maggioranza dei suoi URL. */
function dominantLanguage(urls: string[]): string | null {
  const counts = new Map<string, number>();
  for (const u of urls) {
    const info = languageOf(u);
    if (info) counts.set(info.code, (counts.get(info.code) ?? 0) + 1);
  }
  if (!counts.size) return null;
  // la lingua deve coprire la maggioranza: un template misto non e' una variante
  const [best, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return n / urls.length > 0.6 ? best : null;
}

/** Forma neutra rispetto alla lingua di un insieme di URL. */
function neutralShape(urls: string[]): string | null {
  const shapes = new Set<string>();
  for (const u of urls.slice(0, 30)) {
    const info = languageOf(u);
    if (!info) return null;
    // si tiene solo la profondita' del percorso, non i segmenti di contenuto
    const depth = info.neutral.split('/').filter(Boolean).length;
    shapes.add(`${depth}:${info.neutral.split('/').filter(Boolean)[1] ?? ''}`);
  }
  return shapes.size === 1 ? [...shapes][0] : null;
}

/**
 * Divide i template fra lingua principale e varianti.
 *
 * Due template sono varianti l'uno dell'altro se i loro URL hanno la stessa
 * forma a meno del segmento di lingua. La lingua principale e' quella con piu'
 * pagine: e' la versione che il sito serve davvero di piu', quindi quella su
 * cui vale la pena spendere il campionamento pieno.
 */
export function groupByLanguage<T extends TemplateLike>(
  templates: T[],
  /** URL -> versioni in altra lingua dichiarate dalla pagina (hreflang) */
  alternatesByUrl?: Map<string, string[]>,
): LanguageGrouping<T> {
  const withLang = new Map<T, string>();
  const standalone: T[] = [];
  for (const t of templates) {
    const code = dominantLanguage(t.memberUrls);
    if (code) withLang.set(t, code);
    else standalone.push(t);
  }

  /* --- unione: due template finiscono insieme se sono varianti ---------- */
  const parent = new Map<T, T>();
  const find = (t: T): T => {
    let r = t;
    while (parent.get(r) && parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };
  const union = (a: T, b: T) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const t of withLang.keys()) parent.set(t, t);

  /**
   * Segnale 1, autorevole: la pagina dichiara le proprie traduzioni.
   *
   * E' l'unico modo di riconoscere le varianti con slug tradotti
   * (`/it/eventi` e `/en/events`), che sono proprio quelle piu' pesanti:
   * su hintogroup.eu erano trenta pagine che restavano fuori.
   */
  if (alternatesByUrl?.size) {
    const templateOfUrl = new Map<string, T>();
    for (const t of withLang.keys()) for (const u of t.memberUrls) templateOfUrl.set(u, t);
    for (const t of withLang.keys()) {
      for (const url of t.memberUrls) {
        for (const alt of alternatesByUrl.get(url) ?? []) {
          const other = templateOfUrl.get(alt);
          if (other && other !== t && withLang.get(other) !== withLang.get(t)) union(t, other);
        }
      }
    }
  }

  /**
   * Segnale 2, di ripiego: stessa forma di percorso, lingua diversa.
   *
   * La condizione sulla lingua DIVERSA non e' un dettaglio: senza, due
   * template italiani con percorsi della stessa forma ma struttura diversa
   * venivano scambiati per traduzioni l'uno dell'altro e campionati a un
   * terzo. Osservato su dati veri, tre casi su nove.
   */
  const byShape = new Map<string, T[]>();
  for (const t of withLang.keys()) {
    const shape = neutralShape(t.memberUrls);
    if (!shape) continue;
    if (!byShape.has(shape)) byShape.set(shape, []);
    byShape.get(shape)!.push(t);
  }
  for (const group of byShape.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (withLang.get(group[i]) !== withLang.get(group[j])) union(group[i], group[j]);
      }
    }
  }

  /* --- in ogni famiglia la lingua con piu' pagine tiene il campione pieno */
  const families = new Map<T, T[]>();
  for (const t of withLang.keys()) {
    const root = find(t);
    if (!families.has(root)) families.set(root, []);
    families.get(root)!.push(t);
  }

  const primary: T[] = [...standalone];
  const secondary: LanguageGrouping<T>['secondary'] = [];
  for (const family of families.values()) {
    /**
     * Si sceglie la LINGUA principale, non il template principale.
     *
     * L'unione e' transitiva: se il blog italiano e quello inglese sono
     * varianti, e l'inglese si unisce a un secondo template italiano, tutti e
     * tre finiscono nella stessa famiglia. Promuovendo il solo template piu'
     * grande, l'altro template ITALIANO veniva ridotto a controllo a campione
     * pur non essendo la traduzione di niente - una perdita di copertura
     * silenziosa, osservata sui dati veri.
     *
     * Dentro una famiglia, tutti i template della lingua prevalente restano a
     * campionamento pieno: sono strutture diverse, non traduzioni.
     */
    const pagesPerLang = new Map<string, number>();
    for (const t of family) {
      const c = withLang.get(t)!;
      pagesPerLang.set(c, (pagesPerLang.get(c) ?? 0) + t.pageCount);
    }
    const primaryCode = [...pagesPerLang.entries()].sort((a, b) => b[1] - a[1])[0][0];
    for (const t of family) {
      const code = withLang.get(t)!;
      if (code === primaryCode) primary.push(t);
      else secondary.push({ template: t, code, primaryCode });
    }
  }

  return { primary, secondary };
}
