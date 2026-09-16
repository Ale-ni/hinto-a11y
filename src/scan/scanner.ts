/**
 * Orchestratore della scansione di una pagina.
 *
 * Esegue nell'ordine: axe-core, poi i check custom. Ogni osservazione viene
 * normalizzata in `Evidence`, che e' volutamente priva di giudizio: contiene
 * solo cosa e' stato osservato, dove, e su quale componente. Il verdetto
 * arriva dopo, nell'analyzer.
 */
import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Browser, BrowserContext, Page } from 'playwright';
import pLimit from 'p-limit';
import type { DiscoveredPage, Evidence, SiteTarget } from '../core/types.js';
import { newContext } from './browser.js';
import { stessoSito } from '../crawl/crawler.js';
import { resolveSignature } from '../core/signature.js';
import { runAxe, AXE_VERSION } from './axeRunner.js';
import { INJECTED_HELPERS, stableClassesScript } from './injected.js';
import {
  detectAndDismiss,
  triggerLazyContent,
  type ConsentOutcome,
  type ConsentOverride,
} from './consent.js';
import {
  checkContrastStates,
  checkForms,
  checkKeyboard,
  checkLinks,
  checkMedia,
  checkReflow,
  type RawObservation,
} from './checks.js';

export { AXE_VERSION };

export interface ScanOptions {
  concurrency: number;
  timeoutMs: number;
  /** Cattura screenshot degli elementi problematici */
  screenshots: boolean;
  /** Massimo di screenshot per pagina: sono la voce di costo piu' alta */
  maxScreenshotsPerPage: number;
  screenshotDir: string;
  userAgent: string;
  viewport: { width: number; height: number };
  /** Numero massimo di pressioni di Tab nel percorso da tastiera */
  maxTabs: number;
  /** Includi i criteri WCAG 2.2 come raccomandazione */
  includeForward: boolean;
  /** Rileva, audita e chiude i banner di consenso */
  handleConsent: boolean;
  /** Scorre la pagina per innescare i contenuti caricati in differita */
  triggerLazy: boolean;
  /**
   * Classi ritenute strutturali, calcolate durante il clustering.
   * Senza queste le firme dei componenti sono instabili sui siti con
   * CSS-in-JS, e la deduplica non collassa nulla.
   */
  stableClasses: string[];
  /** id ricorrenti: un id raro identifica un contenuto, non uno slot */
  stableIds: string[];
  /** Selettori del banner forniti dalla configurazione del sito */
  consentOverride?: ConsentOverride;
  /** Percorso dello stato del browser salvato da `a11y consent-setup` */
  storageStatePath?: string;
  /**
   * File di avanzamento: ogni pagina misurata ci viene scritta subito.
   * Se presente, una scansione interrotta riprende da dove si era fermata.
   */
  checkpointPath?: string;
}

export const DEFAULT_SCAN: ScanOptions = {
  concurrency: 3,
  timeoutMs: 30000,
  screenshots: true,
  maxScreenshotsPerPage: 12,
  screenshotDir: 'out/screenshots',
  userAgent: 'HintoA11yEngine/0.1 (+accessibility audit)',
  viewport: { width: 1366, height: 900 },
  maxTabs: 60,
  includeForward: true,
  handleConsent: true,
  triggerLazy: true,
  stableClasses: [],
  stableIds: [],
};

export interface PageScanResult {
  url: string;
  siteId: string;
  fingerprint: string;
  title: string;
  evidence: Evidence[];
  tabOrder: Array<{ index: number; selector: string; label: string; component: string }>;
  passedRules: string[];
  /** Esito della gestione del banner di consenso, se presente */
  consent?: ConsentOutcome;
  httpStatus?: number;
  error?: string;
  durationMs: number;
  /**
   * Questa pagina e' stata visitata "a freddo", senza stato salvato, per poter
   * auditare il banner di consenso. Serve al ripristino: riprendendo una
   * scansione interrotta bisogna sapere se quel passaggio e' gia' avvenuto.
   */
  coldPass?: boolean;
}

function evidenceId(siteId: string, url: string, obs: RawObservation): string {
  return createHash('sha1')
    .update(`${siteId}|${url}|${obs.checkId}|${obs.selector}|${obs.observation.slice(0, 80)}`)
    .digest('hex')
    .slice(0, 16);
}

async function captureElement(
  page: Page,
  selector: string,
  outPath: string,
): Promise<string | undefined> {
  try {
    const loc = page.locator(selector).first();
    if ((await loc.count()) === 0) return undefined;
    await loc.scrollIntoViewIfNeeded({ timeout: 2000 });
    await mkdir(path.dirname(outPath), { recursive: true });
    await loc.screenshot({ path: outPath, timeout: 5000 });
    return outPath;
  } catch {
    return undefined;
  }
}

export async function scanPage(
  context: BrowserContext,
  target: DiscoveredPage,
  opts: ScanOptions,
): Promise<PageScanResult> {
  const started = Date.now();
  const page = await context.newPage();
  const evidence: Evidence[] = [];
  let tabOrder: PageScanResult['tabOrder'] = [];
  let passedRules: string[] = [];
  let consent: ConsentOutcome | undefined;

  try {
    const response = await page.goto(target.url, {
      waitUntil: 'domcontentloaded',
      timeout: opts.timeoutMs,
    });

    /**
     * Le pagine di errore non si auditano: sono template di sistema, spesso
     * privi di navigazione, e producono finding veri ma privi di significato
     * ("nessun elemento raggiungibile da tastiera" su un 404). Lasciarli nel
     * backlog significa far perdere tempo a chi lo legge. Li segnaliamo invece
     * come collegamenti rotti, che e' l'informazione utile.
     */
    /**
     * Reindirizzamento fuori sito.
     *
     * `page.goto` segue i reindirizzamenti in silenzio. Senza questo controllo
     * il motore misura la pagina di ARRIVO e la registra sotto l'URL di
     * PARTENZA: su un sito reale un articolo rimandava al sito di un'altra
     * organizzazione, e ventisette difetti altrui sono finiti nel rapporto del
     * cliente sotto un indirizzo del cliente. Un rapporto che fattura i
     * problemi di qualcun altro non e' un rapporto sbagliato: e' un rapporto
     * che non si puo' difendere davanti a chi deve correggerli.
     *
     * La pagina esce dall'audit e resta segnalata per quello che e': un
     * collegamento che porta fuori.
     */
    const arrivo = page.url();
    if (!stessoSito(arrivo, target.url)) {
      return {
        url: target.url,
        siteId: target.siteId,
        fingerprint: target.fingerprint,
        title: '',
        evidence: [],
        tabOrder: [],
        passedRules: [],
        httpStatus: response?.status(),
        error: `reindirizza a un altro sito (${new URL(arrivo).hostname}): esclusa dall'audit`,
        durationMs: Date.now() - started,
      };
    }

    const status = response?.status() ?? 0;
    if (status >= 400) {
      return {
        url: target.url,
        siteId: target.siteId,
        fingerprint: target.fingerprint,
        title: '',
        evidence: [],
        tabOrder: [],
        passedRules: [],
        httpStatus: status,
        error: `pagina non disponibile (HTTP ${status}): esclusa dall'audit`,
        durationMs: Date.now() - started,
      };
    }

    // lasciamo respirare eventuali componenti client-side
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(400);

    await page.evaluate(stableClassesScript(opts.stableClasses));
    await page.evaluate(INJECTED_HELPERS);
    const title = await page.title();

    const collected: RawObservation[] = [];

    /* --- banner di consenso ---------------------------------------- *
     * Va gestito per primo, prima di qualunque altra misura: finche' e'
     * aperto copre la pagina, cattura il focus e falsa ogni screenshot.
     * Ma prima di chiuderlo lo auditiamo, perche' e' la prima barriera che
     * incontra un utente e dopo la chiusura non sarebbe piu' verificabile.  */
    if (opts.handleConsent) {
      consent = await detectAndDismiss(page, opts.consentOverride, async (containerSelector: string) => {
        const banner = await runAxe(page, opts.includeForward, containerSelector).catch(
          () => null,
        );
        if (!banner) return;
        for (const obs of banner.observations) {
          collected.push({
            ...obs,
            // marcatura, non composizione: la firma viene risolta dopo, in
            // Node, e solo allora riceve il prefisso
            data: { ...obs.data, __consentBanner: true },
            observation: `[banner di consenso] ${obs.observation}`,
          });
        }
      }).catch(() => undefined);

      if (consent?.detected) {
        if (consent.keyboardReachable === false) {
          collected.push({
            checkId: 'consent-not-keyboard-reachable',
            criteria: ['2.1.1', '2.4.3'],
            selector: consent.containerSelector ?? 'body',
            componentSignature: 'banner-consenso',
            html: '',
            observation:
              'Il banner di consenso copre la pagina ma non si raggiunge con il tasto Tab: chi naviga da tastiera non puo\' chiuderlo e resta bloccato fuori dal sito.',
            data: { platform: consent.platform },
            engineImpact: 'critical',
          });
        }
        if (!consent.dismissed) {
          /**
           * Fallimento esplicito, non una nota a margine.
           *
           * Alla prima prova su un sito vero il banner e' rimasto aperto su
           * tutte le 39 pagine e il motore ha tirato dritto emettendo una nota
           * di gravita' media: l'intera scansione era inquinata - contrasti
           * falsati dall'overlay, ordine di focus catturato, screenshot
           * coperti - ma nulla lo diceva a chi leggeva il rapporto.
           *
           * Meglio nessun dato che dati falsi: la pagina esce dai risultati.
           */
          return {
            url: target.url,
            siteId: target.siteId,
            fingerprint: target.fingerprint,
            title,
            evidence: [],
            tabOrder: [],
            passedRules: [],
            consent,
            error:
              `banner di consenso non chiudibile (${consent.platform ?? 'sconosciuto'}, ` +
              `selettore ${consent.containerSelector ?? 'ignoto'}): pagina esclusa perche' i ` +
              `risultati si riferirebbero al banner invece che al contenuto`,
            durationMs: Date.now() - started,
          };
        }
        // il DOM e' cambiato: gli helper vanno reiniettati
        await page.evaluate(INJECTED_HELPERS).catch(() => {});
      }
    }

    /* --- contenuti differiti --------------------------------------- *
     * Senza questo passaggio un sito con immagini lazy o animazioni allo
     * scroll verrebbe auditato mezzo vuoto, senza alcun errore visibile:
     * un falso negativo silenzioso, il peggior tipo di errore.            */
    if (opts.triggerLazy) {
      await triggerLazyContent(page).catch(() => 0);
      await page.evaluate(INJECTED_HELPERS).catch(() => {});
    }

    /* --- livello deterministico --- */
    const axeOut = await runAxe(page, opts.includeForward);
    collected.push(...axeOut.observations);
    passedRules = axeOut.passedRules;

    /* --- check custom: raccolgono cio' che axe non vede --- */
    const [media, links, forms, contrast] = await Promise.all([
      checkMedia(page).catch(() => [] as RawObservation[]),
      checkLinks(page).catch(() => [] as RawObservation[]),
      checkForms(page).catch(() => [] as RawObservation[]),
      checkContrastStates(page).catch(() => [] as RawObservation[]),
    ]);
    collected.push(...media, ...links, ...forms, ...contrast);

    // struttura e tastiera vanno in sequenza: muovono il focus e lo scroll
    const { checkStructure } = await import('./checks.js');
    collected.push(...(await checkStructure(page).catch(() => [])));

    const kb = await checkKeyboard(page, opts.maxTabs).catch(() => ({
      observations: [] as RawObservation[],
      tabOrder: [],
    }));
    collected.push(...kb.observations);
    tabOrder = kb.tabOrder;

    // reflow per ultimo: cambia il viewport
    collected.push(...(await checkReflow(page).catch(() => [])));

    /* --- risoluzione delle firme, in Node --------------------------- *
     * Il browser ha raccolto la catena di antenati; la firma la compone
     * qui una funzione pura, testabile e rieseguibile offline.            */
    const stable = new Set(opts.stableClasses);
    const stableIds = new Set(opts.stableIds ?? []);
    const rawSignatures = new Map<RawObservation, string>();
    for (const obs of collected) {
      rawSignatures.set(obs, obs.componentSignature);
      const resolved = resolveSignature(obs.componentSignature, stable, stableIds);
      obs.componentSignature = obs.data.__consentBanner
        ? `banner-consenso > ${resolved}`
        : resolved;
    }

    /* --- normalizzazione in Evidence + screenshot selettivi --- */
    let shots = 0;
    const shotBySignature = new Set<string>();

    for (const obs of collected) {
      const id = evidenceId(target.siteId, target.url, obs);
      let screenshot: string | undefined;

      const worthShooting =
        opts.screenshots &&
        shots < opts.maxScreenshotsPerPage &&
        obs.selector &&
        obs.selector !== 'body' &&
        (obs.engineImpact === 'critical' || obs.engineImpact === 'serious') &&
        !shotBySignature.has(obs.componentSignature);

      if (worthShooting) {
        const rel = path.join(opts.screenshotDir, target.siteId, `${id}.png`);
        screenshot = await captureElement(page, obs.selector, rel);
        if (screenshot) {
          shots++;
          shotBySignature.add(obs.componentSignature);
        }
      }

      evidence.push({
        id,
        source: obs.checkId.startsWith('axe')
          ? 'axe-core'
          : obs.checkId.startsWith('keyboard') || obs.checkId.startsWith('focus')
            ? 'keyboard-walk'
            : obs.checkId.startsWith('img') || obs.checkId.startsWith('bg-')
              ? 'media'
              : obs.checkId.startsWith('link-')
                ? 'links'
                : obs.checkId.startsWith('form-')
                  ? 'forms'
                  : obs.checkId.startsWith('contrast-')
                    ? 'contrast-states'
                    : obs.checkId.startsWith('reflow') || obs.checkId.startsWith('text-spacing')
                      ? 'reflow'
                      : 'structure',
        checkId: obs.checkId,
        pageUrl: target.url,
        siteId: target.siteId,
        fingerprint: target.fingerprint,
        criteria: obs.criteria,
        selector: obs.selector,
        componentSignature: obs.componentSignature,
        signatureInput: rawSignatures.get(obs),
        html: obs.html,
        observation: obs.observation,
        data: obs.data,
        engineImpact: obs.engineImpact,
        screenshot,
      });
    }

    return {
      url: target.url,
      siteId: target.siteId,
      fingerprint: target.fingerprint,
      title,
      evidence,
      tabOrder,
      passedRules,
      consent,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    return {
      url: target.url,
      siteId: target.siteId,
      fingerprint: target.fingerprint,
      title: '',
      evidence,
      tabOrder,
      passedRules,
      consent,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - started,
    };
  } finally {
    await page.close().catch(() => {});
  }
}

/* ------------------------------------------------------------------ *
 * Avanzamento su disco
 * ------------------------------------------------------------------ */

/** Una riga JSON per pagina: un file troncato perde al massimo l'ultima riga. */
async function appendCheckpoint(file: string, res: PageScanResult): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, JSON.stringify(res) + '\n', 'utf8');
}

async function readCheckpoint(file: string): Promise<PageScanResult[]> {
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch {
    return [];
  }
  const out: PageScanResult[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as PageScanResult);
    } catch {
      // riga troncata da un'interruzione a meta' scrittura: si scarta e basta
    }
  }
  return out;
}

export async function scanPages(
  browser: Browser,
  pages: DiscoveredPage[],
  sites: SiteTarget[],
  opts: ScanOptions = DEFAULT_SCAN,
  onProgress?: (done: number, total: number, url: string) => void,
): Promise<PageScanResult[]> {
  const baseContextOptions = {
    userAgent: opts.userAgent,
    viewport: opts.viewport,
    ignoreHTTPSErrors: true,
    // Il motion ridotto evita che caroselli e animazioni falsino gli screenshot
    reducedMotion: 'reduce' as const,
  };

  /**
   * Due contesti, per una ragione precisa.
   *
   * Lo stato salvato da `a11y consent-setup` fa sparire il banner, il che e'
   * ottimo per scansionare il sito ma cancellerebbe anche la possibilita' di
   * AUDITARE il banner - che e' la prima barriera che incontra un utente e
   * spesso la piu' grave. Quindi la prima pagina si visita "a freddo", senza
   * stato, cosi' il banner compare e viene analizzato; tutte le altre usano
   * lo stato e non lo vedono nemmeno.
   */
  const useStoredState = !!opts.storageStatePath;
  const context = await newContext(browser, {
    ...baseContextOptions,
    ...(useStoredState ? { storageState: opts.storageStatePath } : {}),
  });
  const coldContext = useStoredState ? await newContext(browser, baseContextOptions) : null;

  /* --- ripristino da una scansione interrotta -------------------------- *
   * Misurare una pagina costa un caricamento completo nel browser: e' la voce
   * di costo dominante dell'intero motore. Perderla perche' il processo si e'
   * interrotto a tre quarti - una disconnessione, il portatile che si chiude,
   * un timeout del sito - significa buttare via ore su un sito grande.
   * Ogni risultato viene quindi scritto su disco appena prodotto, e una
   * scansione ripresa salta le pagine gia' misurate.
   *
   * Non e' un compromesso sulla qualita': le misure sono le stesse, cambia
   * solo QUANDO vengono salvate.                                            */
  const previous = opts.checkpointPath ? await readCheckpoint(opts.checkpointPath) : [];
  const alreadyDone = new Set(previous.map((r) => r.url));
  const remaining = pages.filter((p) => !alreadyDone.has(p.url));
  const coldAlreadyDone = previous.some((r) => r.coldPass);

  const limit = pLimit(opts.concurrency);
  const results: PageScanResult[] = [...previous];
  let done = previous.length;

  await Promise.all(
    remaining.map((p, index) =>
      limit(async () => {
        const cold = index === 0 && !coldAlreadyDone && !!coldContext;
        const ctx = cold ? coldContext! : context;
        const res = await scanPage(ctx, p, opts);
        if (cold) res.coldPass = true;
        results.push(res);
        if (opts.checkpointPath) await appendCheckpoint(opts.checkpointPath, res);
        done++;
        onProgress?.(done, pages.length, p.url);
      }),
    ),
  );

  await context.close();
  if (coldContext) await coldContext.close();
  return results;
}
