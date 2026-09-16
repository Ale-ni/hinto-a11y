/**
 * Discovery e clustering delle pagine.
 *
 * Strategia in due fasi, pensata per costare poco:
 *
 *   Fase 1 - discovery a basso costo. Sitemap.xml se c'e', altrimenti crawl
 *            HTTP semplice (nessun browser). Migliaia di URL in pochi secondi.
 *
 *   Fase 2 - clustering. Prima raggruppiamo per FORMA DELL'URL (euristica
 *            gratuita: /corsi/1234 e /corsi/5678 sono lo stesso template),
 *            poi apriamo col browser solo qualche campione per gruppo e
 *            confermiamo con la firma strutturale, fondendo i gruppi che
 *            in realta' condividono lo stesso template.
 *
 * Cosi' il browser - che e' la parte lenta - tocca decine di pagine invece
 * di migliaia, ma il clustering resta accurato.
 */
import { setTimeout as sleep } from 'node:timers/promises';
import type { Browser } from 'playwright';
import pLimit from 'p-limit';
import type { DiscoveredPage, SiteTarget, TemplateCluster } from '../core/types.js';
import { newContext } from '../scan/browser.js';
import { groupByLanguage } from './language.js';
import {
  buildRegistry,
  DEFAULT_STABILITY,
  generatedRatio,
  resolveStableClasses,
  resolveStableIds,
} from '../core/identity.js';
import {
  computeFingerprint,
  extractMaterial,
  labelFromUrl,
  type SignatureMaterial,
  type StructuralSignature,
} from './fingerprint.js';

export interface CrawlOptions {
  /** Tetto di URL raccolte per sito in fase di discovery */
  maxPagesPerSite: number;
  /** Profondita' massima del crawl a link */
  maxDepth: number;
  /** Richieste HTTP contemporanee */
  concurrency: number;
  /** Pausa fra richieste, in ms: per non martellare il server del cliente */
  politenessDelayMs: number;
  /** Campioni aperti col browser per ogni gruppo di URL */
  probesPerGroup: number;
  /** Pagine effettivamente scansionate per ogni template finale */
  samplesPerTemplate: number;
  /**
   * Sotto questa dimensione il campionamento si disattiva e si analizza tutto.
   * 0 lo disattiva.
   */
  scanAllUnderPages: number;
  /** Tetto ai campioni di un singolo template, per quanto grande sia */
  maxSamplesPerTemplate: number;
  /**
   * Campioni per le varianti linguistiche di un template gia' campionato.
   * 0 disattiva la riduzione e le tratta come template a se'.
   */
  languageSpotCheckSamples: number;
  userAgent: string;
}

export const DEFAULT_CRAWL: CrawlOptions = {
  maxPagesPerSite: 800,
  maxDepth: 3,
  concurrency: 4,
  politenessDelayMs: 150,
  probesPerGroup: 2,
  samplesPerTemplate: 3,
  scanAllUnderPages: 40,
  maxSamplesPerTemplate: 8,
  languageSpotCheckSamples: 1,
  userAgent:
    'HintoA11yEngine/0.1 (+accessibility audit; contatto: accessibilita@hintogroup.eu)',
};

/* ------------------------------------------------------------------ *
 * Normalizzazione URL
 * ------------------------------------------------------------------ */

export function normalizeUrl(raw: string, base: string): string | null {
  try {
    const u = new URL(raw, base);
    if (!/^https?:$/.test(u.protocol)) return null;
    u.hash = '';
    // Parametri di tracciamento: non cambiano la pagina, gonfiano il crawl
    for (const p of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_cid|mc_eid|_ga)/i.test(p)) u.searchParams.delete(p);
    }
    // Normalizza lo slash finale tranne che in root
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch {
    return null;
  }
}

const SKIP_EXT =
  /\.(pdf|docx?|xlsx?|pptx?|zip|rar|7z|tar|gz|jpe?g|png|gif|webp|avif|svg|ico|mp4|mp3|wav|avi|mov|css|js|json|xml|rss|woff2?|ttf|eot)$/i;

/**
 * Quanti campioni per un template.
 *
 * Il campionamento esiste per rendere abbordabile un sito grande: scansionare
 * 632 pagine costa ore, 92 campioni le rappresentano. Su un sito piccolo pero'
 * non fa risparmiare nulla di significativo e costa copertura.
 *
 * Osservato su tef.tech, 27 pagine: con tre campioni per template il motore
 * ne scansionava sette, e SETTE TIPI DI DIFETTO stavano su pagine mai guardate
 * - cinque di questi sulla sola `/news/369`. Scansionare tutte e 27 le pagine
 * costa due minuti. Il campionamento, li', non serviva a niente.
 *
 * Sopra la soglia il numero di campioni cresce con la radice della dimensione
 * del cluster, non a passo fisso: un template che copre 268 pagine merita piu'
 * attenzione di uno che ne copre due. La crescita e' sublineare e con un tetto,
 * altrimenti il risparmio sparisce.
 *
 * Costo misurato sui due siti reali: hintogroup passa da 92 a 126 campioni
 * (+37% di tempo di scansione), tef passa da 9 a 27 - cioe' l'intero sito.
 */
function quantiCampioni(
  pageCount: number,
  fingerprint: string,
  opts: CrawlOptions,
  totalePagine: number,
): number {
  // sito piccolo: si guarda tutto, il campionamento non avrebbe senso
  if (opts.scanAllUnderPages > 0 && totalePagine <= opts.scanAllUnderPages) return pageCount;

  const incerto = fingerprint === 'unknown' || fingerprint.startsWith('mixed-');
  const base = Math.ceil(Math.sqrt(pageCount));
  const limitato = Math.max(opts.samplesPerTemplate, Math.min(base, opts.maxSamplesPerTemplate));
  return Math.min(pageCount, limitato + (incerto ? 1 : 0));
}

/**
 * Due URL appartengono allo stesso sito?
 *
 * Serve a riconoscere i reindirizzamenti che portano FUORI. Su tef.tech una
 * pagina di notizie rimandava al sito di Bocconi: il motore registrava l'URL
 * richiesto, auditava la pagina di arrivo, e il rapporto attribuiva al cliente
 * i difetti di un sito che non e' suo. E' lo stesso errore, piu' grave, di
 * quando i difetti di un widget di terze parti finivano sul front-end del
 * cliente.
 *
 * Il confronto ignora il solo prefisso `www.`, perche' `www.x.it` e `x.it` sono
 * lo stesso sito; tutto il resto - sottodomini compresi - e' un altro sito e
 * merita una decisione esplicita di chi configura l'audit.
 */
export function stessoSito(a: string, b: string): boolean {
  const host = (u: string): string => {
    try {
      return new URL(u).hostname.replace(/^www\./i, '').toLowerCase();
    } catch {
      return '';
    }
  };
  const ha = host(a);
  return ha !== '' && ha === host(b);
}

/**
 * Percorsi di servizio che non sono pagine del sito.
 *
 * Non sono contenuto e non hanno un template: sono endpoint tecnici che
 * finiscono nell'HTML per come funziona l'infrastruttura. Lasciarli passare
 * costa due volte - una pagina del campione sprecata su un 404, e un cluster
 * spurio nel rapporto.
 *
 * `/cdn-cgi/l/email-protection` e' l'offuscamento degli indirizzi email di
 * Cloudflare: compare come href su qualunque sito dietro Cloudflare che
 * pubblichi un'email, risponde 404 a una visita diretta, ed e' finito nel
 * campione di un sito reale.
 */
const SKIP_PATH =
  /\/(cdn-cgi|wp-json|xmlrpc\.php|wp-admin|wp-login\.php|\.well-known)(\/|$)/i;

/**
 * Forma dell'URL, normalizzazione di primo livello: sostituisce i segmenti
 * palesemente identificativi con un segnaposto.
 */
export function urlPattern(url: string): string {
  try {
    const u = new URL(url);
    const segs = u.pathname.split('/').filter(Boolean).map(normalizeSegment);
    const query = [...u.searchParams.keys()].sort().join(',');
    return `${u.hostname}/${segs.join('/')}${query ? '?' + query : ''}`;
  } catch {
    return url;
  }
}

function normalizeSegment(s: string): string {
  if (/^\d+$/.test(s)) return ':num';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s)) return ':uuid';
  if (/^\d{4}$/.test(s)) return ':year';
  if (/\d{3,}/.test(s)) return ':id';
  return s.toLowerCase();
}

/**
 * Inferenza dei pattern su tutto l'insieme delle URL.
 *
 * L'euristica per singola URL non basta: uno slug come "/corsi/informatica"
 * e' indistinguibile da una pagina statica come "/contatti" se la si guarda
 * da sola. Guardando invece TUTTE le URL insieme, la struttura emerge: se un
 * percorso ha molti figli distinti, quei figli sono contenuti generati e non
 * pagine a se'. Senza questo passaggio il clustering non comprime nulla e si
 * finisce per sondare col browser una pagina per ogni contenuto.
 */
export function inferUrlPatterns(urls: string[], collectionThreshold = 4): Map<string, string> {
  // figli distinti di ogni prefisso di percorso
  const childrenOf = new Map<string, Set<string>>();

  const segmentsOf = (url: string): { host: string; segs: string[] } | null => {
    try {
      const u = new URL(url);
      return { host: u.hostname, segs: u.pathname.split('/').filter(Boolean).map(normalizeSegment) };
    } catch {
      return null;
    }
  };

  for (const url of urls) {
    const parsed = segmentsOf(url);
    if (!parsed) continue;
    for (let i = 0; i < parsed.segs.length; i++) {
      const prefix = `${parsed.host}/${parsed.segs.slice(0, i).join('/')}`;
      if (!childrenOf.has(prefix)) childrenOf.set(prefix, new Set());
      childrenOf.get(prefix)!.add(parsed.segs[i]);
    }
  }

  /**
   * Un prefisso e' una COLLEZIONE se ha molti figli e quei figli sono in
   * prevalenza foglie, cioe' non hanno a loro volta figli.
   *
   * Il solo conteggio dei figli non basta, ed e' l'errore che ha fatto
   * fallire il clustering al primo sito vero: su un sito con prefisso di
   * lingua, "/it" ha molti figli (blog, partner, portfolio, eventi...) e
   * verrebbe scambiato per una collezione, collassando l'intero sito in un
   * unico gruppo. Ma quei figli sono SEZIONI - hanno figli propri - mentre
   * gli articoli sotto "/it/blog" sono foglie. E' questa la differenza.
   */
  const isCollection = (prefix: string, depth: number): boolean => {
    const children = childrenOf.get(prefix);
    if (!children || children.size < collectionThreshold) return false;

    let leaves = 0;
    for (const child of children) {
      const grandchildren = childrenOf.get(`${prefix}/${child}`);
      if (!grandchildren || grandchildren.size === 0) leaves++;
    }
    const leafRatio = leaves / children.size;

    /**
     * La soglia e' alta di proposito. Con una soglia permissiva bastano due
     * pagine di errore scoperte dal crawl (/intranet, /webmail) per far
     * sembrare collezione la radice di un sito: le sezioni diventano ":item",
     * l'intero sito collassa in un gruppo solo e interi template non vengono
     * mai campionati. E' successo davvero, e il sintomo era muto - nessun
     * errore, semplicemente meno contenuto analizzato.
     */
    if (leafRatio < 0.85) return false;

    /**
     * La radice non e' quasi mai una collezione: i suoi figli sono le sezioni
     * del sito. L'eccezione e' il sito piatto, dove decine di contenuti stanno
     * tutti al primo livello - e li' serve una prova molto piu' forte.
     */
    if (depth === 0) return children.size >= 15 && leafRatio >= 0.9;

    return true;
  };

  const out = new Map<string, string>();

  for (const url of urls) {
    const parsed = segmentsOf(url);
    if (!parsed) {
      out.set(url, url);
      continue;
    }
    const patterned = parsed.segs.map((seg, i) => {
      if (seg.startsWith(':')) return seg;
      const prefix = `${parsed.host}/${parsed.segs.slice(0, i).join('/')}`;
      return isCollection(prefix, i) ? ':item' : seg;
    });
    let query = '';
    try {
      query = [...new URL(url).searchParams.keys()].sort().join(',');
    } catch {
      /* ignore */
    }
    out.set(url, `${parsed.host}/${patterned.join('/')}${query ? '?' + query : ''}`);
  }

  return out;
}

/* ------------------------------------------------------------------ *
 * Fase 1 - discovery
 * ------------------------------------------------------------------ */

async function fetchText(url: string, ua: string, timeoutMs = 15000): Promise<{ body: string; status: number } | null> {
  try {
    const ctrl = new AbortController();
    const t = globalThis.setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, {
      headers: { 'user-agent': ua, accept: 'text/html,application/xhtml+xml,application/xml' },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    globalThis.clearTimeout(t);
    const ct = res.headers.get('content-type') ?? '';
    if (!/(text\/html|xml)/i.test(ct)) return { body: '', status: res.status };
    return { body: await res.text(), status: res.status };
  } catch {
    return null;
  }
}

/** Legge sitemap.xml, seguendo gli indici annidati. */
async function readSitemaps(site: SiteTarget, opts: CrawlOptions): Promise<string[]> {
  const found = new Set<string>();
  const queue = [
    new URL('/sitemap.xml', site.baseUrl).toString(),
    new URL('/sitemap_index.xml', site.baseUrl).toString(),
    new URL('/sitemap-index.xml', site.baseUrl).toString(),
  ];
  const seenSitemaps = new Set<string>();

  while (queue.length && found.size < opts.maxPagesPerSite) {
    const sm = queue.shift()!;
    if (seenSitemaps.has(sm)) continue;
    seenSitemaps.add(sm);
    if (seenSitemaps.size > 50) break;

    const res = await fetchText(sm, opts.userAgent);
    if (!res || !res.body) continue;

    const locs = [...res.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
    const isIndex = /<sitemapindex/i.test(res.body);
    for (const loc of locs) {
      if (isIndex) {
        queue.push(loc);
      } else {
        const n = normalizeUrl(loc, site.baseUrl);
        if (n && sameOrigin(n, site.baseUrl) && !SKIP_EXT.test(n) && !SKIP_PATH.test(n)) found.add(n);
      }
    }
  }
  return [...found];
}

function sameOrigin(url: string, base: string): boolean {
  try {
    return new URL(url).origin === new URL(base).origin;
  } catch {
    return false;
  }
}

function extractLinks(html: string, pageUrl: string, base: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*\shref\s*=\s*["']([^"']+)["']/gi)) {
    const n = normalizeUrl(m[1], pageUrl);
    if (n && sameOrigin(n, base) && !SKIP_EXT.test(n) && !SKIP_PATH.test(n)) out.add(n);
  }
  return [...out];
}

/** Crawl BFS a link, usato quando la sitemap manca o e' povera. */
async function crawlLinks(
  site: SiteTarget,
  seeds: string[],
  opts: CrawlOptions,
  onProgress?: (n: number) => void,
): Promise<Map<string, { depth: number; status?: number }>> {
  const visited = new Map<string, { depth: number; status?: number }>();
  let frontier: Array<{ url: string; depth: number }> = seeds.map((u) => ({ url: u, depth: 0 }));
  const limit = pLimit(opts.concurrency);
  const excludeRes = site.exclude.map((p) => new RegExp(p));

  while (frontier.length && visited.size < opts.maxPagesPerSite) {
    const batch = frontier.splice(0, Math.max(opts.concurrency * 4, 20));
    const next: Array<{ url: string; depth: number }> = [];

    await Promise.all(
      batch.map((item) =>
        limit(async () => {
          if (visited.has(item.url) || visited.size >= opts.maxPagesPerSite) return;
          if (excludeRes.some((re) => re.test(item.url))) return;
          visited.set(item.url, { depth: item.depth });
          onProgress?.(visited.size);

          if (item.depth >= opts.maxDepth) return;
          const res = await fetchText(item.url, opts.userAgent);
          if (opts.politenessDelayMs) await sleep(opts.politenessDelayMs);
          if (!res) return;
          visited.set(item.url, { depth: item.depth, status: res.status });
          if (!res.body) return;

          for (const link of extractLinks(res.body, item.url, site.baseUrl)) {
            if (!visited.has(link)) next.push({ url: link, depth: item.depth + 1 });
          }
        }),
      ),
    );

    // Dedup della frontiera mantenendo la profondita' minima
    const seen = new Set<string>();
    frontier = [...frontier, ...next].filter((x) => {
      if (visited.has(x.url) || seen.has(x.url)) return false;
      seen.add(x.url);
      return true;
    });
  }

  return visited;
}

export async function discover(
  site: SiteTarget,
  opts: CrawlOptions = DEFAULT_CRAWL,
  onProgress?: (msg: string) => void,
): Promise<DiscoveredPage[]> {
  const excludeRes = site.exclude.map((p) => new RegExp(p));
  const pages = new Map<string, DiscoveredPage>();

  onProgress?.(`[${site.id}] lettura sitemap...`);
  const fromSitemap = await readSitemaps(site, opts);
  for (const url of fromSitemap) {
    if (excludeRes.some((re) => re.test(url))) continue;
    pages.set(url, {
      url,
      siteId: site.id,
      title: '',
      fingerprint: '',
      depth: 0,
      discoveredVia: 'sitemap',
    });
  }
  onProgress?.(`[${site.id}] sitemap: ${pages.size} URL`);

  // La sitemap da sola spesso non copre tutto: integriamo sempre con un
  // crawl a link partendo dalla home, ma limitato.
  const seeds = [normalizeUrl(site.baseUrl, site.baseUrl)!];
  const linkOpts: CrawlOptions = {
    ...opts,
    maxPagesPerSite: Math.max(60, Math.floor(opts.maxPagesPerSite / 4)),
  };
  onProgress?.(`[${site.id}] crawl a link (max ${linkOpts.maxPagesPerSite})...`);
  const crawled = await crawlLinks(site, seeds, linkOpts);
  for (const [url, meta] of crawled) {
    if (pages.has(url)) {
      pages.get(url)!.depth = Math.min(pages.get(url)!.depth, meta.depth);
      continue;
    }
    if (excludeRes.some((re) => re.test(url))) continue;
    pages.set(url, {
      url,
      siteId: site.id,
      title: '',
      fingerprint: '',
      depth: meta.depth,
      httpStatus: meta.status,
      discoveredVia: 'link',
    });
  }

  onProgress?.(`[${site.id}] totale scoperto: ${pages.size} URL`);
  return [...pages.values()];
}

/* ------------------------------------------------------------------ *
 * Fase 2 - clustering
 * ------------------------------------------------------------------ */

/** Sceglie i campioni piu' rappresentativi: URL corte e poco profonde. */
function pickRepresentatives(urls: string[], n: number): string[] {
  return [...urls]
    .sort((a, b) => {
      const da = new URL(a).pathname.split('/').length;
      const db = new URL(b).pathname.split('/').length;
      if (da !== db) return da - db;
      return a.length - b.length;
    })
    .slice(0, n);
}

export interface ClusterResult {
  templates: TemplateCluster[];
  pages: DiscoveredPage[];
  /** Classi ritenute strutturali: vanno passate allo scanner per le firme */
  stableClasses: string[];
  /** id ricorrenti abbastanza da valere come identita' strutturale */
  stableIds: string[];
  /** Quota di classi con aspetto generato: diagnostica di "ostilita" del sito */
  generatedRatio: number;
}

export async function clusterByTemplate(
  browser: Browser,
  pages: DiscoveredPage[],
  opts: CrawlOptions = DEFAULT_CRAWL,
  onProgress?: (msg: string) => void,
): Promise<ClusterResult> {
  /* --- 2a. raggruppamento gratuito per forma dell'URL --- */
  const patterns = inferUrlPatterns(pages.map((p) => p.url));
  const byPattern = new Map<string, DiscoveredPage[]>();
  for (const p of pages) {
    const key = `${p.siteId}::${patterns.get(p.url) ?? urlPattern(p.url)}`;
    if (!byPattern.has(key)) byPattern.set(key, []);
    byPattern.get(key)!.push(p);
  }
  onProgress?.(`${pages.length} URL -> ${byPattern.size} gruppi per forma di URL`);

  /* --- 2b. sonde: si raccoglie il MATERIALE, non ancora la firma --------- *
   * Le firme non si possono calcolare adesso: dipendono da quali classi
   * ricorrono fra pagine diverse, e la frequenza si osserva solo dopo aver
   * visto tutte le sonde.                                                   */
  const ctx = await newContext(browser, {
    userAgent: opts.userAgent,
    viewport: { width: 1366, height: 900 },
    ignoreHTTPSErrors: true,
  });
  const limit = pLimit(Math.min(opts.concurrency, 4));

  const materials = new Map<string, SignatureMaterial>(); // url -> materiale
  const probesOfGroup = new Map<string, string[]>(); // gruppo -> url sondate
  let probed = 0;

  await Promise.all(
    [...byPattern.entries()].map(([key, group]) =>
      limit(async () => {
        const probes = pickRepresentatives(
          group.map((g) => g.url),
          Math.max(opts.probesPerGroup, 2),
        );
        const page = await ctx.newPage();
        const done: string[] = [];
        try {
          for (const url of probes) {
            try {
              const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
              // reindirizzamento fuori sito: la pagina di arrivo non e' del cliente
              if (!stessoSito(page.url(), url)) continue;
              if ((resp?.status() ?? 0) >= 400) continue;
              await page.waitForTimeout(400);
              materials.set(url, await extractMaterial(page));
              done.push(url);
              const target = group.find((g) => g.url === url);
              if (target) {
                target.title = await page.title();
                target.httpStatus = resp?.status();
              }
            } catch {
              continue;
            }
          }
        } finally {
          await page.close().catch(() => {});
        }
        probesOfGroup.set(key, done);
        probed++;
        onProgress?.(`sondati ${probed}/${byPattern.size} gruppi`);
      }),
    ),
  );
  await ctx.close();

  /* --- 2c. registro delle classi e firme --------------------------------- */
  const registry = buildRegistry([...materials.values()].map((m) => m.allClasses));
  const stable = resolveStableClasses(registry, {
    ...DEFAULT_STABILITY,
    sampledPages: materials.size,
  });
  const idRegistry = buildRegistry([...materials.values()].map((m) => m.allIds ?? []));
  const stableIds = resolveStableIds(idRegistry, { sampledPages: materials.size });
  const ratio = generatedRatio(registry, stable);

  onProgress?.(
    `classi osservate: ${Object.keys(registry).length}, ` +
      `di cui ${Math.round(ratio * 100)}% con aspetto generato; ` +
      `utilizzabili nelle firme: ${stable.size}`,
  );
  if (ratio > 0.5) {
    onProgress?.(
      `  il sito usa nomi di classe generati (CSS-in-JS): le firme ripiegano ` +
        `sulla struttura, il clustering sara' piu' grossolano`,
    );
  }

  const signatures = new Map<string, StructuralSignature>();
  for (const [url, material] of materials) {
    signatures.set(url, computeFingerprint(material, stable));
  }

  /* --- 2d. assegnazione ai gruppi ---------------------------------------- */
  const labelHint = new Map<string, string>();
  const heterogeneous: string[] = [];

  for (const [key, group] of byPattern) {
    const probes = probesOfGroup.get(key) ?? [];
    const sigs = probes.map((u) => signatures.get(u)).filter((x): x is StructuralSignature => !!x);
    const distinct = new Set(sigs.map((x) => x.fingerprint));

    if (distinct.size === 1) {
      const sig = sigs[0];
      labelHint.set(sig.fingerprint, sig.inferredLabel);
      for (const g of group) g.fingerprint = sig.fingerprint;
    } else if (distinct.size > 1) {
      // le sonde non concordano: non indoviniamo. Le pagine sondate tengono la
      // loro firma, le altre vanno in un cluster proprio campionato piu' a fondo.
      for (const s of sigs) labelHint.set(s.fingerprint, s.inferredLabel);
      for (const u of probes) {
        const g = group.find((x) => x.url === u);
        const sig = signatures.get(u);
        if (g && sig) g.fingerprint = sig.fingerprint;
      }
      const mixedFp = `mixed-${key.split('::')[1] ?? key}`.slice(0, 48);
      labelHint.set(
        mixedFp,
        `${labelFromUrl(group[0].url) ?? 'Gruppo'} - struttura non uniforme`,
      );
      for (const g of group) if (!probes.includes(g.url)) g.fingerprint = mixedFp;
      heterogeneous.push(key);
    }
  }

  /* --- 2e. cluster finali ------------------------------------------------ */
  const byFingerprint = new Map<string, DiscoveredPage[]>();
  for (const p of pages) {
    if (!p.fingerprint) p.fingerprint = 'unknown';
    if (!byFingerprint.has(p.fingerprint)) byFingerprint.set(p.fingerprint, []);
    byFingerprint.get(p.fingerprint)!.push(p);
  }

  const templates: TemplateCluster[] = [...byFingerprint.entries()]
    .map(([fp, members]) => {
      const structural = labelHint.get(fp);
      const fromUrl = labelFromUrl(members[0].url);
      /**
       * Le etichette ricavate dalla forma ("Pagina con tabelle") dicono poco a
       * chi legge il rapporto e si ripetono su template diversi. Quando la
       * struttura non identifica il tipo di contenuto, il percorso dell'URL e'
       * molto piu' informativo: "Scheda blog" invece di "Pagina con tabelle".
       */
      const GENERIC = new Set([
        'Pagina di contenuto',
        'Pagina con tabelle',
        'Pagina con form',
        'Elenco',
        'Contenuto con sidebar',
      ]);
      const label =
        fp === 'unknown'
          ? 'Pagine non classificate (sonda fallita)'
          : structural && !GENERIC.has(structural)
            ? structural
            : (fromUrl ?? structural ?? 'Template non classificato');
      return {
        fingerprint: fp,
        label,
        siteIds: [...new Set(members.map((m) => m.siteId))],
        pageCount: members.length,
        samples: pickRepresentatives(members.map((m) => m.url), quantiCampioni(members.length, fp, opts, pages.length)),
        memberUrls: members.map((m) => m.url),
      };
    })
    .sort((a, b) => b.pageCount - a.pageCount);

  /* --- varianti linguistiche ------------------------------------------- *
   * La stessa pagina in italiano e in inglese ha la stessa struttura, quindi
   * misurarla due volte per intero e' lavoro duplicato. Non si salta pero':
   * un alt non tradotto o un lang sbagliato sono difetti veri e vivono solo
   * nella variante. Si scende a controllo a campione.                      */
  if (opts.languageSpotCheckSamples > 0) {
    const alternatesByUrl = new Map<string, string[]>();
    for (const [url, m] of materials) {
      if (m.alternates?.length) alternatesByUrl.set(url, m.alternates);
    }
    const { secondary } = groupByLanguage(templates, alternatesByUrl);
    let saved = 0;
    for (const { template, code, primaryCode } of secondary) {
      const before = template.samples.length;
      template.samples = pickRepresentatives(
        template.memberUrls,
        opts.languageSpotCheckSamples,
      );
      template.label = `${template.label} [${code.toUpperCase()}: controllo a campione]`;
      saved += before - template.samples.length;
    }
    if (secondary.length) {
      onProgress?.(
        `  ${secondary.length} template sono varianti linguistiche di altri gia' campionati: ` +
          `ridotti a ${opts.languageSpotCheckSamples} pagina di controllo ciascuno ` +
          `(${saved} caricamenti risparmiati). I difetti propri della lingua restano rilevabili.`,
      );
    }
  }

  const mixedPages = templates
    .filter((t) => t.fingerprint.startsWith('mixed-'))
    .reduce((n, t) => n + t.pageCount, 0);
  if (heterogeneous.length) {
    onProgress?.(
      `  ${heterogeneous.length} gruppi con struttura non uniforme ` +
        `(${mixedPages} pagine): campionati piu' a fondo`,
    );
  }

  const totalSamples = templates.reduce((n, t) => n + t.samples.length, 0);
  if (opts.scanAllUnderPages > 0 && pages.length <= opts.scanAllUnderPages) {
    onProgress?.(
      `  sito piccolo (${pages.length} pagine): campionamento disattivato, si analizza tutto. ` +
        `Su un sito di queste dimensioni campionare fa risparmiare poco e costa copertura.`,
    );
  }
  onProgress?.(
    `${byPattern.size} gruppi -> ${templates.length} template distinti; ` +
      `da scansionare ${totalSamples} pagine invece di ${pages.length} ` +
      `(compressione ${totalSamples > 0 ? (pages.length / totalSamples).toFixed(1) : '-'}x)`,
  );

  return {
    templates,
    pages,
    stableClasses: [...stable],
    stableIds: [...stableIds],
    generatedRatio: ratio,
  };
}
