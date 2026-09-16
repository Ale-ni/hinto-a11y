#!/usr/bin/env node
/**
 * Interfaccia a riga di comando.
 *
 * Le fasi sono separate e riprendibili perche' un audit reale non fila liscio:
 * il crawl si interrompe, il cliente aggiunge un dominio, il triage torna dopo
 * due giorni. Ogni fase legge e riscrive `out/run.json`, quindi si puo' rifare
 * solo il pezzo che serve senza ripetere tutto.
 *
 *   a11y crawl   <config>   scoperta URL + clustering per template
 *   a11y scan    <config>   scansione del campione
 *   a11y triage  <config>   costruisce i pacchetti / applica le risposte
 *   a11y report  <config>   dashboard HTML + backlog Excel
 *   a11y audit   <config>   tutto in sequenza
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import { z } from 'zod';
import { SiteTarget, type ScanRun } from '../core/types.js';
import { DEFAULT_CRAWL, clusterByTemplate, discover } from '../crawl/crawler.js';
import { AXE_VERSION, DEFAULT_SCAN, scanPages } from '../scan/scanner.js';
import { launchBrowser } from '../scan/browser.js';
import { DEFAULT_ANALYZE, analyze, summarize } from '../analyze/analyzer.js';
import { formatQuality, selfCheck } from '../analyze/selfCheck.js';
import { resolveSignature, rederiveFromComposed } from '../core/signature.js';
import { looksLikeHashedWord, needsStrongEvidence } from '../core/identity.js';
import { DEFAULT_PACK, applyTriage, buildPacks } from '../analyze/aiPort.js';
import { ManualTriageAdapter } from '../analyze/adapters/manual.js';
import { AnthropicTriageAdapter, DEFAULT_ANTHROPIC } from '../analyze/adapters/anthropic.js';
import { DEFAULT_DASHBOARD, renderDashboard } from '../report/dashboard.js';
import { renderExcel } from '../report/excel.js';

const ENGINE_VERSION = '0.4.3';

/* ------------------------------------------------------------------ *
 * Configurazione
 * ------------------------------------------------------------------ */

const Config = z.object({
  project: z.string(),
  standard: z.string().default('WCAG 2.1 AA / EN 301 549 v3.2.1'),
  outDir: z.string().default('out'),
  sites: z.array(SiteTarget).min(1),
  crawl: z
    .object({
      maxPagesPerSite: z.number().int().optional(),
      maxDepth: z.number().int().optional(),
      concurrency: z.number().int().optional(),
      politenessDelayMs: z.number().int().optional(),
      probesPerGroup: z.number().int().optional(),
      samplesPerTemplate: z.number().int().optional(),
      /** Sotto questa dimensione si analizza tutto il sito, senza campionare */
      scanAllUnderPages: z.number().int().optional(),
      maxSamplesPerTemplate: z.number().int().optional(),
    })
    .default({}),
  consent: z
    .object({
      /** Selettore del contenitore del banner, se il riconoscimento fallisce */
      containerSelector: z.string().optional(),
      /** Selettore del pulsante di accettazione */
      acceptSelector: z.string().optional(),
      /** Stato del browser salvato da `a11y consent-setup` */
      storageStatePath: z.string().optional(),
    })
    .default({}),
  scan: z
    .object({
      concurrency: z.number().int().optional(),
      screenshots: z.boolean().optional(),
      maxTabs: z.number().int().optional(),
      includeForward: z.boolean().optional(),
    })
    .default({}),
  triage: z
    .object({
      /** 'manual' nel POC, 'anthropic' in produzione: cambia solo questo */
      adapter: z.enum(['manual', 'anthropic', 'none']).default('manual'),
      model: z.string().default(DEFAULT_ANTHROPIC.model),
      findingsPerPack: z.number().int().default(DEFAULT_PACK.findingsPerPack),
      promptPath: z.string().default('prompts/triage.it.md'),
    })
    .default({
      adapter: 'manual',
      model: DEFAULT_ANTHROPIC.model,
      findingsPerPack: DEFAULT_PACK.findingsPerPack,
      promptPath: 'prompts/triage.it.md',
    }),
});
type Config = z.infer<typeof Config>;

async function loadConfig(file: string): Promise<Config> {
  const raw = await readFile(file, 'utf8');
  return Config.parse(JSON.parse(raw));
}

function runPath(cfg: Config): string {
  return path.join(cfg.outDir, 'run.json');
}

async function loadRun(cfg: Config): Promise<ScanRun> {
  const raw = await readFile(runPath(cfg), 'utf8');
  return JSON.parse(raw) as ScanRun;
}

/** Quante pagine sono gia' state misurate in un tentativo interrotto. */
async function countCheckpoint(file: string): Promise<number> {
  try {
    const raw = await readFile(file, 'utf8');
    return raw.split('\n').filter((l) => l.trim()).length;
  } catch {
    return 0;
  }
}

async function saveRun(cfg: Config, run: ScanRun): Promise<void> {
  await mkdir(cfg.outDir, { recursive: true });
  await writeFile(runPath(cfg), JSON.stringify(run, null, 2), 'utf8');
}

const log = (msg: string) => console.log(msg);
const step = (msg: string) => console.log(`\n\x1b[1m${msg}\x1b[0m`);

/* ------------------------------------------------------------------ *
 * Fasi
 * ------------------------------------------------------------------ */

async function phaseCrawl(cfg: Config): Promise<ScanRun> {
  step('1/4  Scoperta e clustering');

  const opts = { ...DEFAULT_CRAWL, ...stripUndefined(cfg.crawl) };
  const browser = await launchBrowser();

  try {
    const allPages = [];
    for (const site of cfg.sites) {
      const pages = await discover(site, opts, log);
      allPages.push(...pages);
    }

    const cluster = await clusterByTemplate(browser, allPages, opts, log);
    const { templates, pages } = cluster;

    const run: ScanRun = {
      id: `run-${Date.now()}`,
      startedAt: new Date().toISOString(),
      project: cfg.project,
      engineVersion: ENGINE_VERSION,
      axeVersion: AXE_VERSION,
      standard: cfg.standard,
      sites: cfg.sites,
      stableClasses: cluster.stableClasses,
      stableIds: cluster.stableIds,
      generatedClassRatio: cluster.generatedRatio,
      pages,
      templates,
      evidence: [],
      findings: [],
      stats: {
        pagesDiscovered: pages.length,
        pagesScanned: 0,
        templatesFound: templates.length,
        evidenceCollected: 0,
        findingsAfterDedupe: 0,
        needsReviewCount: 0,
        dedupeRatio: 1,
      },
    };

    await saveRun(cfg, run);
    return run;
  } finally {
    await browser.close();
  }
}

async function phaseScan(cfg: Config, run: ScanRun): Promise<ScanRun> {
  step('2/4  Scansione del campione');

  const opts = {
    ...DEFAULT_SCAN,
    ...stripUndefined(cfg.scan),
    screenshotDir: path.join(cfg.outDir, 'screenshots'),
    stableClasses: run.stableClasses ?? [],
    stableIds: run.stableIds ?? [],
    consentOverride: {
      containerSelector: cfg.consent.containerSelector,
      acceptSelector: cfg.consent.acceptSelector,
    },
    storageStatePath: (await statePathIfExists(cfg)) ?? undefined,
    checkpointPath: path.join(cfg.outDir, 'scansione-parziale.jsonl'),
  };

  if (opts.storageStatePath) {
    log(`  stato del browser riutilizzato: ${opts.storageStatePath}`);
  }

  // scansioniamo solo i campioni: e' tutto il punto del clustering
  const sampleUrls = new Set(run.templates.flatMap((t) => t.samples));
  const toScan = run.pages.filter((p) => sampleUrls.has(p.url));

  const resumed = await countCheckpoint(opts.checkpointPath);
  if (resumed > 0) {
    log(
      `  ripresa: ${resumed} pagine erano gia' state misurate in un tentativo precedente, ` +
        `non vengono rifatte`,
    );
  }
  log(`${toScan.length} pagine da scansionare (su ${run.pages.length} scoperte)`);

  const browser = await launchBrowser();
  try {
    const results = await scanPages(browser, toScan, run.sites, opts, (done, total, url) => {
      const short = url.length > 70 ? url.slice(0, 67) + '...' : url;
      log(`  [${String(done).padStart(3)}/${total}] ${short}`);
    });

    const failed = results.filter((r) => r.error);
    if (failed.length) {
      log(`\n  ${failed.length} pagine non scansionate:`);
      for (const f of failed.slice(0, 10)) log(`   - ${f.url}: ${f.error}`);
    }

    // Se il banner ha bloccato la scansione, il motore non lascia l'operatore
    // davanti a DevTools: elenca i candidati che ha trovato dentro il banner.
    const blocked = results.find((r) => r.consent?.diagnostics);
    if (blocked?.consent?.diagnostics) {
      const d = blocked.consent.diagnostics;
      log(`\n  Banner di consenso non chiuso (${blocked.consent.platform ?? 'sconosciuto'}).`);
      log(`  Contenitore: ${blocked.consent.containerSelector}`);
      log(`  Candidati trovati dentro il banner:`);
      for (const c of d.candidates.filter((x) => x.visible && x.text).slice(0, 10)) {
        log(`    "${c.text}"  ->  ${c.selector}`);
      }
      log(`\n  Copia il selettore giusto nella configurazione:`);
      log(`    "consent": { "containerSelector": "${blocked.consent.containerSelector}", "acceptSelector": "..." }`);
      log(`  Oppure lancia:  a11y consent-setup <config>   e accetta il banner a mano una volta.`);
    }

    run.evidence = results.flatMap((r) => r.evidence);
    run.stats.pagesScanned = results.filter((r) => !r.error).length;
    run.stats.evidenceCollected = run.evidence.length;

    log(`\n${run.evidence.length} evidenze raccolte`);
    await saveRun(cfg, run);
    // la scansione e' completa: l'avanzamento ha esaurito il suo scopo, e
    // lasciarlo li' farebbe saltare le pagine alla prossima scansione vera
    await rm(opts.checkpointPath, { force: true });
    return run;
  } finally {
    await browser.close();
  }
}

function phaseAnalyze(cfg: Config, run: ScanRun): ScanRun {
  step('3/4  Analisi e deduplica');

  run.findings = analyze(run.evidence, run.templates, run.sites, DEFAULT_ANALYZE);
  const stats = summarize(run.evidence, run.findings);
  Object.assign(run.stats, {
    evidenceCollected: stats.evidenceCollected,
    findingsAfterDedupe: stats.findingsAfterDedupe,
    needsReviewCount: stats.needsReviewCount,
    dedupeRatio: stats.dedupeRatio,
  });

  log(
    `${stats.evidenceCollected} evidenze -> ${stats.findingsAfterDedupe} problemi distinti ` +
      `(compressione ${stats.dedupeRatio}x)`,
  );
  log(
    `  non conformita' certe: ${stats.byVerdict.fail}  ·  da verificare: ${stats.byVerdict['needs-review']}`,
  );
  log(
    `  critica ${stats.byBand.critica} · alta ${stats.byBand.alta} · ` +
      `media ${stats.byBand.media} · bassa ${stats.byBand.bassa}`,
  );

  /* --- autodiagnosi ------------------------------------------------- *
   * Il motore controlla la salute della PROPRIA analisi e lo dice subito.
   * Senza questo passaggio, i difetti dell'analisi - finding duplicati,
   * firme instabili, cluster che inghiottono meta' sito - si scoprivano solo
   * leggendo il backlog a mano, e ogni scoperta costava una scansione nuova.  */
  const quality = selfCheck(run);
  run.quality = quality;
  log('');
  log('Qualita\' dell\'analisi:');
  log(formatQuality(quality));

  return run;
}

/**
 * Riesegue analisi e deduplica su una scansione gia' salvata.
 *
 * E' il ciclo di feedback rapido: una correzione alle firme o alla deduplica
 * si valida in secondi sui dati reali del cliente, senza rieseguire crawl e
 * browser. Prima esisteva solo la strada lenta, e il costo lo pagava l'utente
 * rilanciando la scansione.
 */
function phaseReplay(cfg: Config, run: ScanRun): ScanRun {
  step('Replay su scansione salvata');

  const before = run.findings.map((f) => ({
    title: f.title,
    component: f.component,
    occ: f.occurrenceCount,
  }));

  const stable = new Set(run.stableClasses ?? []);
  const stableIds = new Set(run.stableIds ?? []);
  const withRaw = run.evidence.filter((e) => e.signatureInput).length;
  const legacy = withRaw === 0 && run.evidence.length > 0;

  /**
   * Scansione anteriore alla 0.3.0: niente materiale grezzo. Si ricalcola
   * comunque, partendo dalla firma gia' composta (vedi rederiveFromComposed).
   * E' il caso che rende utilizzabili le scansioni gia' pagate.
   */
  const dropClass = (cls: string) =>
    needsStrongEvidence(cls) && looksLikeHashedWord(cls);

  let recomputed = 0;
  for (const e of run.evidence) {
    const next = e.signatureInput
      ? (() => {
          const resolved = resolveSignature(e.signatureInput!, stable, stableIds);
          return e.data?.__consentBanner ? `banner-consenso > ${resolved}` : resolved;
        })()
      : rederiveFromComposed(e.componentSignature, dropClass);
    if (next !== e.componentSignature) recomputed++;
    e.componentSignature = next;
  }

  log(`  ${run.evidence.length} evidenze · ${recomputed} firme cambiate`);
  if (legacy) {
    log('  (scansione anteriore alla 0.3.0: firme ricostruite dalla firma composta)');
  }

  run.findings = analyze(run.evidence, run.templates, run.sites, DEFAULT_ANALYZE);
  const stats = summarize(run.evidence, run.findings);
  Object.assign(run.stats, {
    findingsAfterDedupe: stats.findingsAfterDedupe,
    needsReviewCount: stats.needsReviewCount,
    dedupeRatio: stats.dedupeRatio,
  });

  log(`  problemi: ${before.length} -> ${run.findings.length}`);

  // diff leggibile: cosa e' sparito e cosa e' comparso
  const key = (x: { title: string; occ: number }) => `${x.title}::${x.occ}`;
  const beforeKeys = new Map<string, number>();
  for (const b of before) beforeKeys.set(key(b), (beforeKeys.get(key(b)) ?? 0) + 1);
  const afterKeys = new Map<string, number>();
  for (const f of run.findings) {
    const k = `${f.title}::${f.occurrenceCount}`;
    afterKeys.set(k, (afterKeys.get(k) ?? 0) + 1);
  }
  const collapsed: string[] = [];
  for (const [k, n] of beforeKeys) {
    const after = afterKeys.get(k) ?? 0;
    if (after < n) collapsed.push(`${k.split('::')[0].slice(0, 56)} (${n} -> ${after})`);
  }
  if (collapsed.length) {
    log(`\n  collassati: ${collapsed.length} gruppi`);
    for (const c of collapsed.slice(0, 8)) log(`   · ${c}`);
  }

  const quality = selfCheck(run);
  run.quality = quality;
  log('');
  log('Qualita\' dell\'analisi:');
  log(formatQuality(quality));

  return run;
}

async function phaseTriage(cfg: Config, run: ScanRun): Promise<ScanRun> {
  if (cfg.triage.adapter === 'none') return run;

  step('3b/4  Triage');

  const packs = buildPacks(run.findings, run.evidence, run.project, run.standard, {
    ...DEFAULT_PACK,
    findingsPerPack: cfg.triage.findingsPerPack,
  });

  const adapter =
    cfg.triage.adapter === 'anthropic'
      ? new AnthropicTriageAdapter({
          ...DEFAULT_ANTHROPIC,
          apiKey: process.env.ANTHROPIC_API_KEY ?? '',
          model: cfg.triage.model,
          promptPath: cfg.triage.promptPath,
        })
      : new ManualTriageAdapter({
          inboxDir: path.join(cfg.outDir, 'triage', 'in'),
          outboxDir: path.join(cfg.outDir, 'triage', 'out'),
          promptPath: cfg.triage.promptPath,
        });

  if (cfg.triage.adapter === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
    log('  ANTHROPIC_API_KEY non impostata: triage saltato.');
    return run;
  }

  log(`  adapter: ${adapter.name} · ${packs.length} pacchetti · ${packs.reduce((n, p) => n + p.findings.length, 0)} finding`);

  const results = await adapter.triage(packs);

  if (results.length === 0) {
    log(`  Nessuna risposta di triage trovata.`);
    if (adapter.name === 'manual') {
      log(`  I pacchetti sono in ${path.join(cfg.outDir, 'triage', 'in')}/`);
      log(`  Incolla ogni file .prompt.md in Claude e salva la risposta JSON in`);
      log(`  ${path.join(cfg.outDir, 'triage', 'out')}/, poi rilancia: a11y report <config>`);
    }
    return run;
  }

  const { findings, applied, rejected } = applyTriage(run.findings, results);
  run.findings = findings.sort((a, b) => {
    const rank: Record<string, number> = { fail: 0, 'needs-review': 1, pass: 2, inapplicable: 3 };
    if (a.verdict !== b.verdict) return rank[a.verdict] - rank[b.verdict];
    return b.severity.score - a.severity.score;
  });

  log(`  ${applied} finding arricchiti dal triage`);
  if (rejected.length) {
    log(`  ${rejected.length} verdetti rifiutati perche' oltre il tetto del criterio:`);
    for (const r of rejected.slice(0, 5)) log(`   - ${r}`);
  }

  const stats = summarize(run.evidence, run.findings);
  run.stats.needsReviewCount = stats.needsReviewCount;

  return run;
}

async function phaseReport(cfg: Config, run: ScanRun): Promise<void> {
  step('4/4  Report');

  await mkdir(cfg.outDir, { recursive: true });

  const htmlPath = path.join(cfg.outDir, 'dashboard.html');
  let shotInfo = '';
  const html = await renderDashboard(run, {
    ...DEFAULT_DASHBOARD,
    baseDir: '.',
    outDir: cfg.outDir,
    onDiagnostics: (d) => {
      shotInfo =
        `  evidenze visive: ${d.byEvidence.size} problemi su ${run.findings.length}` +
        (d.missing
          ? `  —  ATTENZIONE: ${d.missing} screenshot risultano registrati ma i file non ` +
            `sono stati trovati. La cartella screenshots/ e' stata spostata o cancellata: ` +
            `il rapporto esce senza quelle immagini.`
          : '');
    },
  });
  await writeFile(htmlPath, html, 'utf8');
  log(`  dashboard: ${htmlPath}`);
  if (shotInfo) log(shotInfo);

  const xlsxPath = path.join(cfg.outDir, 'backlog.xlsx');
  await renderExcel(run, xlsxPath);
  log(`  backlog:   ${xlsxPath}`);

  run.finishedAt = new Date().toISOString();
  await saveRun(cfg, run);
}

function defaultStatePath(cfg: Config): string {
  return cfg.consent.storageStatePath ?? path.join(cfg.outDir, 'consent-state.json');
}

async function statePathIfExists(cfg: Config): Promise<string | null> {
  const p = defaultStatePath(cfg);
  try {
    await readFile(p, 'utf8');
    return p;
  } catch {
    return null;
  }
}

/**
 * Accettazione manuale una tantum.
 *
 * E' l'ultimo gradino della scala di ripieghi per il consenso, ed e' anche il
 * piu' robusto: invece di indovinare come si chiude un banner fatto in casa,
 * lo chiude una persona una volta sola in un browser visibile. Lo stato del
 * browser - cookie e localStorage - viene salvato e riusato da tutte le
 * scansioni successive, sulle quali il banner non compare nemmeno.
 *
 * Lo stesso meccanismo risolve gratuitamente le AREE AUTENTICATE: se durante
 * questa sessione si fa anche il login, le scansioni seguenti entrano nelle
 * pagine riservate. Era uno dei pezzi mancanti del motore.
 */
async function phaseConsentSetup(cfg: Config): Promise<void> {
  step('Accettazione manuale del consenso');

  const statePath = defaultStatePath(cfg);
  const browser = await launchBrowser(undefined, { headless: false });

  try {
    const ctx = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      ignoreHTTPSErrors: true,
    });
    const page = await ctx.newPage();

    for (const site of cfg.sites) {
      log(`\n  Apro ${site.baseUrl}`);
      await page.goto(site.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      log('  Nel browser che si e\' aperto: accetta il banner dei cookie.');
      log('  Se servono anche le aree riservate, esegui il login adesso.');
      log('  Quando hai finito, torna qui e premi Invio.');
      await waitForEnter();
    }

    await ctx.storageState({ path: statePath });
    log(`\n  Stato salvato in ${statePath}`);
    log('  Le prossime scansioni lo riutilizzeranno: il banner non comparira\' piu\'.');
    log('  La prima pagina di ogni scansione viene comunque visitata "a freddo",');
    log('  cosi\' il banner resta analizzato come componente a se\'.');
    await ctx.close();
  } finally {
    await browser.close();
  }
}

function waitForEnter(): Promise<void> {
  return new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.once('data', () => {
      process.stdin.pause();
      resolve();
    });
  });
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/* ------------------------------------------------------------------ *
 * Comandi
 * ------------------------------------------------------------------ */

const program = new Command();
program
  .name('a11y')
  .description('Motore di audit di accessibilità per ecosistemi multi-sito')
  .version(ENGINE_VERSION);

program
  .command('crawl')
  .argument('<config>', 'file di configurazione JSON')
  .description('scopre le URL e le raggruppa per template')
  .action(async (configFile: string) => {
    const cfg = await loadConfig(configFile);
    await phaseCrawl(cfg);
  });

program
  .command('consent-setup')
  .argument('<config>')
  .description('apre un browser visibile per accettare il banner (e fare il login) una volta sola')
  .action(async (configFile: string) => {
    const cfg = await loadConfig(configFile);
    await phaseConsentSetup(cfg);
  });

program
  .command('scan')
  .argument('<config>')
  .description('scansiona le pagine campione')
  .action(async (configFile: string) => {
    const cfg = await loadConfig(configFile);
    let run = await loadRun(cfg);
    run = await phaseScan(cfg, run);
    run = phaseAnalyze(cfg, run);
    await saveRun(cfg, run);
  });

program
  .command('triage')
  .argument('<config>')
  .description('costruisce i pacchetti per il modello o applica le risposte')
  .action(async (configFile: string) => {
    const cfg = await loadConfig(configFile);
    let run = await loadRun(cfg);
    run = await phaseTriage(cfg, run);
    await saveRun(cfg, run);
  });

program
  .command('replay')
  .argument('<config>')
  .description('ricalcola firme e deduplica su una scansione salvata, senza rilanciarla')
  .option('--write', 'salva il risultato in run.json invece di limitarsi a mostrarlo')
  .action(async (configFile: string, options: { write?: boolean }) => {
    const cfg = await loadConfig(configFile);
    const run = phaseReplay(cfg, await loadRun(cfg));
    if (options.write) {
      await saveRun(cfg, run);
      log('\n  run.json aggiornato.');
    } else {
      log('\n  (nessun file modificato: usa --write per salvare)');
    }
  });

program
  .command('report')
  .argument('<config>')
  .description('genera dashboard HTML e backlog Excel')
  .action(async (configFile: string) => {
    const cfg = await loadConfig(configFile);
    const run = await loadRun(cfg);
    await phaseReport(cfg, run);
  });

program
  .command('audit')
  .argument('<config>')
  .description('esegue l\'intera pipeline')
  .option(
    '--reuse-crawl',
    'riusa la scoperta URL gia\' fatta in questa cartella invece di rifarla',
  )
  .option(
    '--smoke',
    'giro di prova su poche pagine: serve a vedere se l\'analisi e\' sana prima di pagare la scansione intera',
  )
  .action(async (configFile: string, options: { smoke?: boolean; reuseCrawl?: boolean }) => {
    const cfg = await loadConfig(configFile);
    const t0 = Date.now();

    /**
     * Giro di prova.
     *
     * Esiste perche' ogni difetto dell'analisi e' finora costato una scansione
     * intera per essere scoperto: quaranta minuti e centinaia di richieste al
     * sito del cliente, per poi leggere in fondo che i risultati non erano
     * consegnabili. Il giro di prova percorre esattamente le stesse strade -
     * stesso crawl, stesso clustering, stessi check, stessa autodiagnosi - su
     * un campione ridotto. Se l'autodiagnosi e' pulita qui, lo sara' anche
     * sulla scansione intera, perche' il codice attraversato e' lo stesso.
     * Non sostituisce la scansione: ne anticipa il verdetto in pochi minuti.
     */
    if (options.smoke) {
      cfg.outDir = `${cfg.outDir}-prova`;
      cfg.crawl = { ...cfg.crawl, maxPagesPerSite: 40, samplesPerTemplate: 1 };
      cfg.triage = { ...cfg.triage, adapter: 'none' };
      step('GIRO DI PROVA — campione ridotto, serve solo a validare l\'analisi');
      log(`  esito in ${cfg.outDir}, la scansione vera non viene toccata`);
    }

    /**
     * Il crawl non dipende da come analizziamo: dipende solo dal sito.
     * Su un ecosistema grande scoprire e raggruppare migliaia di URL e' una
     * fetta consistente del tempo totale, e rifarlo per incassare una
     * correzione all'analisi e' lavoro buttato. Resta esplicito e non
     * automatico: una scoperta vecchia di settimane non descrive piu' il sito.
     */
    let run: ScanRun;
    if (options.reuseCrawl) {
      run = await loadRun(cfg);
      const eta = Math.round((Date.now() - new Date(run.startedAt).getTime()) / 3600000);
      step('1/4  Scoperta e clustering — RIUSATA');
      log(`  ${run.pages.length} pagine, ${run.templates.length} template, scoperti ${eta}h fa`);
      run.evidence = [];
      run.findings = [];
    } else {
      run = await phaseCrawl(cfg);
    }
    run = await phaseScan(cfg, run);
    run = phaseAnalyze(cfg, run);
    run = await phaseTriage(cfg, run);
    await phaseReport(cfg, run);

    const mins = ((Date.now() - t0) / 60000).toFixed(1);
    step(`Completato in ${mins} minuti.`);
    if (options.smoke) {
      log(
        '\n  Questo era il giro di prova. Se sopra non compaiono anomalie BLOCCANTI,\n' +
          '  la scansione intera puo' + "'" + ' partire: stessi percorsi di codice, campione piu\' ampio.',
      );
    }
  });

program.parseAsync(process.argv).catch((err) => {
  console.error('\nErrore:', err instanceof Error ? err.message : err);
  process.exit(1);
});
