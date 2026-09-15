/**
 * Dashboard HTML navigabile.
 *
 * Due vincoli non negoziabili.
 *
 * Primo: il report di un audit di accessibilita' deve essere accessibile.
 * Sembra ovvio e quasi nessuno lo rispetta. Qui: HTML semantico, gerarchia dei
 * titoli corretta, filtri con etichette vere, disclosure azionabili da tastiera,
 * focus sempre visibile, contrasto verificato, conteggio risultati annunciato
 * via aria-live, vista tabellare alternativa.
 *
 * Secondo: la severita' non e' mai comunicata dal solo colore. Ogni fascia
 * porta sempre etichetta testuale accanto al colore.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Evidence, Finding, ScanRun } from '../core/types.js';
import { getCriterion, isBaseline } from '../core/wcag.js';

const BAND_META: Record<string, { label: string; color: string; symbol: string }> = {
  critica: { label: 'Critica', color: '#d03b3b', symbol: '●●●●' },
  alta: { label: 'Alta', color: '#ec835a', symbol: '●●●' },
  media: { label: 'Media', color: '#fab219', symbol: '●●' },
  bassa: { label: 'Bassa', color: '#898781', symbol: '●' },
};

const VERDICT_META: Record<string, { label: string; hint: string }> = {
  fail: {
    label: 'Non conforme',
    hint: 'Fallimento dimostrabile in modo deterministico.',
  },
  'needs-review': {
    label: 'Da verificare',
    hint: 'Il criterio richiede giudizio umano: serve conferma di un revisore.',
  },
  pass: { label: 'Conforme', hint: 'Verificato conforme.' },
  inapplicable: { label: 'Non applicabile', hint: 'Il criterio non si applica.' },
};

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** URL leggibile in didascalia: si tiene il percorso, si toglie il protocollo. */
function shortUrl(u: string): string {
  const clean = u.replace(/^https?:\/\//, '');
  return clean.length > 58 ? clean.slice(0, 55) + '...' : clean;
}

export interface DashboardOptions {
  /** Incorpora gli screenshot come data URI, per avere un file unico portabile */
  inlineScreenshots: boolean;
  /** Budget complessivo per gli screenshot incorporati, in byte */
  screenshotBudgetBytes: number;
  baseDir: string;
  /**
   * Cartella di lavoro della scansione. I percorsi degli screenshot sono
   * salvati relativi alla cartella da cui girava il comando: cercarli solo
   * li' significa perderli in silenzio se il rapporto viene rigenerato da
   * un'altra posizione. E' successo davvero.
   */
  outDir?: string;
  /** Riporta a chi chiama quante evidenze visive sono finite nel rapporto */
  onDiagnostics?: (d: ScreenshotLoad) => void;
}

export const DEFAULT_DASHBOARD: DashboardOptions = {
  inlineScreenshots: true,
  screenshotBudgetBytes: 6 * 1024 * 1024,
  baseDir: '.',
};

export interface ScreenshotLoad {
  byEvidence: Map<string, string>;
  /** Finding per cui esiste un riferimento a uno screenshot */
  referenced: number;
  /** ...di cui il file non e' stato trovato su disco */
  missing: number;
}

/**
 * Risolve il percorso di uno screenshot provando piu' basi.
 *
 * Il percorso salvato nell'evidenza e' relativo alla cartella da cui girava la
 * scansione (`out-hinto/screenshots/...`). Se il rapporto viene rigenerato da
 * un'altra posizione, quel percorso non risolve e le immagini spariscono
 * SENZA ERRORE: il rapporto sembra semplicemente un rapporto senza evidenze
 * visive. E' il modo di fallire piu' insidioso, e ci e' gia' costato un
 * documento consegnato senza immagini.
 */
async function readShot(rel: string, opts: DashboardOptions): Promise<Buffer | null> {
  const candidates = [path.resolve(opts.baseDir, rel)];
  if (opts.outDir) {
    // percorso gia' comprensivo della cartella di uscita: lo si prova anche
    // rispetto al padre, e privato del prefisso rispetto alla cartella stessa
    candidates.push(path.resolve(opts.outDir, '..', rel));
    const base = path.basename(opts.outDir);
    if (rel.startsWith(base + '/')) {
      candidates.push(path.resolve(opts.outDir, rel.slice(base.length + 1)));
    }
    candidates.push(path.resolve(opts.outDir, rel));
  }
  for (const c of candidates) {
    try {
      return await readFile(c);
    } catch {
      /* si prova la base successiva */
    }
  }
  return null;
}

async function loadScreenshots(
  findings: Finding[],
  evidence: Evidence[],
  opts: DashboardOptions,
): Promise<ScreenshotLoad> {
  const out = new Map<string, string>();
  if (!opts.inlineScreenshots) return { byEvidence: out, referenced: 0, missing: 0 };

  const evidenceById = new Map(evidence.map((e) => [e.id, e]));
  let used = 0;

  // priorita' ai finding piu' gravi: il budget si esaurisce dove serve di piu'
  const ordered = [...findings].sort((a, b) => b.severity.score - a.severity.score);

  let referenced = 0;
  let missing = 0;

  for (const f of ordered) {
    for (const eid of f.evidenceIds) {
      const ev = evidenceById.get(eid);
      if (!ev?.screenshot) continue;
      if (out.has(eid)) continue;
      referenced++;
      const buf = await readShot(ev.screenshot, opts);
      if (!buf) {
        missing++;
      } else if (used + buf.byteLength <= opts.screenshotBudgetBytes) {
        used += buf.byteLength;
        out.set(eid, `data:image/png;base64,${buf.toString('base64')}`);
      }
      break; // uno screenshot per finding basta
    }
  }
  return { byEvidence: out, referenced, missing };
}

export async function renderDashboard(
  run: ScanRun,
  opts: DashboardOptions = DEFAULT_DASHBOARD,
): Promise<string> {
  const shotLoad = await loadScreenshots(run.findings, run.evidence, opts);
  const shots = shotLoad.byEvidence;
  opts.onDiagnostics?.(shotLoad);
  const evidenceById = new Map(run.evidence.map((e) => [e.id, e]));
  const siteById = new Map(run.sites.map((s) => [s.id, s]));
  const templateByFp = new Map(run.templates.map((t) => [t.fingerprint, t]));

  const f = run.findings;
  const bands = {
    critica: f.filter((x) => x.severity.band === 'critica').length,
    alta: f.filter((x) => x.severity.band === 'alta').length,
    media: f.filter((x) => x.severity.band === 'media').length,
    bassa: f.filter((x) => x.severity.band === 'bassa').length,
  };
  const maxBand = Math.max(...Object.values(bands), 1);
  const failCount = f.filter((x) => x.verdict === 'fail').length;
  const reviewCount = f.filter((x) => x.verdict === 'needs-review').length;

  const totalPagesInEcosystem = run.templates.reduce((n, t) => n + t.pageCount, 0);
  const scannedPages = run.stats.pagesScanned || 0;
  const compression =
    scannedPages > 0 ? (totalPagesInEcosystem / scannedPages).toFixed(1) : '1.0';

  /* --- criteri coinvolti --- */
  const criteriaHit = new Map<string, number>();
  for (const finding of f) {
    for (const c of finding.criteria) {
      criteriaHit.set(c, (criteriaHit.get(c) ?? 0) + 1);
    }
  }

  const findingCards = f
    .map((finding, i) => renderFinding(finding, i, evidenceById, siteById, templateByFp, shots))
    .join('\n');

  const tableRows = f
    .map(
      (x) => `<tr>
      <td>${esc(x.title)}</td>
      <td>${esc(VERDICT_META[x.verdict]?.label ?? x.verdict)}</td>
      <td>${esc(BAND_META[x.severity.band]?.label)}</td>
      <td class="num">${x.severity.score}</td>
      <td>${esc(x.criteria.join(', '))}</td>
      <td>${esc(x.component)}</td>
      <td class="num">${x.occurrenceCount}</td>
      <td>${esc(x.owner)}</td>
    </tr>`,
    )
    .join('\n');

  const siteOptions = run.sites
    .map((s) => `<option value="${esc(s.id)}">${esc(s.label)}</option>`)
    .join('');

  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Audit di accessibilità — ${esc(run.project)}</title>
<style>
  :root {
    color-scheme: light;
    --surface: #fcfcfb;
    --plane: #f4f4f1;
    --card: #ffffff;
    --ink: #0b0b0b;
    --ink-2: #52514e;
    --muted: #6d6b66;
    --line: #dededa;
    --accent: #2a78d6;
    --accent-ink: #184f95;
    --focus: #1a5fb4;
    --critica: #d03b3b;
    --alta: #c25a2c;
    --media: #8a6200;
    --bassa: #6d6b66;
    --radius: 10px;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      color-scheme: dark;
      --surface: #1a1a19;
      --plane: #0d0d0d;
      --card: #232322;
      --ink: #ffffff;
      --ink-2: #c3c2b7;
      --muted: #a3a199;
      --line: #383835;
      --accent: #3987e5;
      --accent-ink: #86b6ef;
      --focus: #86b6ef;
      --critica: #e76b6b;
      --alta: #ec835a;
      --media: #fab219;
      --bassa: #a3a199;
    }
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --surface: #1a1a19; --plane: #0d0d0d; --card: #232322;
    --ink: #ffffff; --ink-2: #c3c2b7; --muted: #a3a199; --line: #383835;
    --accent: #3987e5; --accent-ink: #86b6ef; --focus: #86b6ef;
    --critica: #e76b6b; --alta: #ec835a; --media: #fab219; --bassa: #a3a199;
  }

  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--plane);
    color: var(--ink);
    font: 15px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .wrap { max-width: 1120px; margin: 0 auto; padding: 24px 20px 80px; }

  a { color: var(--accent-ink); }
  :focus-visible {
    outline: 3px solid var(--focus);
    outline-offset: 2px;
    border-radius: 4px;
  }

  .skip {
    position: absolute; left: -9999px;
    background: var(--card); color: var(--ink);
    padding: 10px 14px; border-radius: 6px; z-index: 10;
  }
  .skip:focus { left: 16px; top: 16px; position: fixed; }

  header.page { padding: 28px 0 20px; border-bottom: 1px solid var(--line); margin-bottom: 28px; }
  h1 { font-size: clamp(22px, 3.4vw, 30px); line-height: 1.25; margin: 0 0 8px; letter-spacing: -0.01em; }
  .meta { color: var(--ink-2); margin: 0; font-size: 14px; }
  .meta strong { color: var(--ink); font-weight: 600; }

  h2 { font-size: 19px; margin: 36px 0 14px; letter-spacing: -0.01em; }
  h3 { font-size: 16px; margin: 0; }

  /* --- tessere KPI --- */
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
  .tile {
    background: var(--card); border: 1px solid var(--line);
    border-radius: var(--radius); padding: 16px;
  }
  .tile .v { font-size: 30px; font-weight: 650; line-height: 1.1; letter-spacing: -0.02em; }
  .tile .k { font-size: 13px; color: var(--ink-2); margin-top: 4px; }
  .tile .n { font-size: 12px; color: var(--muted); margin-top: 6px; }

  /* --- distribuzione severita' --- */
  .bars { background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); padding: 18px; }
  .bar-row { display: grid; grid-template-columns: 82px 1fr 52px; align-items: center; gap: 12px; margin-bottom: 10px; }
  .bar-row:last-child { margin-bottom: 0; }
  .bar-label { font-size: 14px; color: var(--ink-2); display: flex; align-items: center; gap: 7px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
  .bar-track { background: var(--plane); border-radius: 4px; height: 22px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 4px; min-width: 3px; }
  .bar-val { text-align: right; font-variant-numeric: tabular-nums; font-size: 14px; color: var(--ink-2); }

  /* --- filtri --- */
  .filters {
    display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end;
    background: var(--card); border: 1px solid var(--line);
    border-radius: var(--radius); padding: 14px 16px; margin-bottom: 8px;
  }
  .field { display: flex; flex-direction: column; gap: 5px; }
  .field label { font-size: 12px; color: var(--ink-2); font-weight: 600; }
  .field select, .field input {
    font: inherit; font-size: 14px; padding: 7px 10px;
    border: 1px solid var(--line); border-radius: 6px;
    background: var(--surface); color: var(--ink); min-width: 150px;
  }
  .count { color: var(--ink-2); font-size: 14px; margin: 12px 2px 16px; }

  /* --- finding --- */
  .finding {
    background: var(--card); border: 1px solid var(--line);
    border-left: 4px solid var(--bassa);
    border-radius: var(--radius); margin-bottom: 12px; overflow: hidden;
  }
  .finding[data-band="critica"] { border-left-color: var(--critica); }
  .finding[data-band="alta"] { border-left-color: var(--alta); }
  .finding[data-band="media"] { border-left-color: var(--media); }

  .finding > summary {
    cursor: pointer; padding: 15px 18px; list-style: none;
    display: grid; grid-template-columns: 1fr auto; gap: 14px; align-items: start;
  }
  .finding > summary::-webkit-details-marker { display: none; }
  .finding > summary:hover { background: color-mix(in srgb, var(--accent) 5%, transparent); }
  .sum-main { min-width: 0; }
  .sum-title { font-size: 15.5px; font-weight: 600; margin-bottom: 6px; line-height: 1.35; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip {
    font-size: 11.5px; padding: 2px 8px; border-radius: 99px;
    border: 1px solid var(--line); color: var(--ink-2); background: var(--surface);
    white-space: nowrap;
  }
  .chip.v-fail { border-color: var(--critica); color: var(--critica); font-weight: 600; }
  .chip.v-review { border-color: var(--media); color: var(--media); font-weight: 600; }
  .chip.wcag { font-variant-numeric: tabular-nums; }
  .chip.fwd { border-style: dashed; }
  .sum-side { text-align: right; white-space: nowrap; }
  .band-tag { font-size: 12.5px; font-weight: 650; display: flex; align-items: center; gap: 6px; justify-content: flex-end; }
  .score { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; margin-top: 2px; }

  .body { padding: 4px 18px 20px; border-top: 1px solid var(--line); }
  .body h4 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin: 18px 0 6px; }
  .body p { margin: 0 0 10px; }
  pre {
    background: var(--plane); border: 1px solid var(--line); border-radius: 6px;
    padding: 12px 14px; overflow-x: auto; font-size: 13px; line-height: 1.55;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .kv { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px 20px; font-size: 13.5px; }
  .kv div span { display: block; color: var(--muted); font-size: 12px; }
  .samples { margin: 0; padding: 0; list-style: none; }
  .samples li { border-top: 1px solid var(--line); padding: 10px 0; font-size: 13.5px; }
  .samples a { word-break: break-all; }
  .samples code { font-size: 12.5px; color: var(--ink-2); word-break: break-all; }
  .shot { max-width: 100%; border: 1px solid var(--line); border-radius: 6px; display: block; background: #fff; }
  .shot-wrap { margin: 0 0 6px; }
  .shot-wrap figcaption { font-size: 12.5px; color: var(--muted); margin-top: 6px; line-height: 1.5; }
  .shot-wrap figcaption code { font-size: 11.5px; }
  .shot-none { font-size: 13px; color: var(--muted); }
  .review-q {
    background: color-mix(in srgb, var(--media) 12%, transparent);
    border-left: 3px solid var(--media); padding: 10px 14px; border-radius: 0 6px 6px 0;
  }

  /* --- tabella --- */
  .table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: var(--radius); background: var(--card); }
  table { border-collapse: collapse; width: 100%; font-size: 13.5px; min-width: 720px; }
  th, td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { background: var(--plane); font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-2); position: sticky; top: 0; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }

  .note {
    background: var(--card); border: 1px solid var(--line);
    border-left: 3px solid var(--accent);
    border-radius: 0 var(--radius) var(--radius) 0;
    padding: 14px 18px; font-size: 14px; color: var(--ink-2);
  }
  .note strong { color: var(--ink); }
  footer { margin-top: 48px; padding-top: 20px; border-top: 1px solid var(--line); color: var(--muted); font-size: 13px; }

  @media (max-width: 640px) {
    .finding > summary { grid-template-columns: 1fr; }
    .sum-side { text-align: left; }
    .band-tag { justify-content: flex-start; }
  }
  @media print {
    .filters, .skip { display: none; }
    .finding { break-inside: avoid; border: 1px solid #999; }
    details { open: true; }
  }
</style>
</head>
<body>
<a class="skip" href="#contenuto">Salta al contenuto</a>
<div class="wrap">

<header class="page">
  <h1>Audit di accessibilità digitale — ${esc(run.project)}</h1>
  <p class="meta">
    Standard di riferimento: <strong>${esc(run.standard)}</strong> ·
    Scansione del <strong>${esc(new Date(run.startedAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }))}</strong> ·
    Motore axe-core ${esc(run.axeVersion)}
  </p>
</header>

<main id="contenuto">

<h2>Quadro di sintesi</h2>
<div class="tiles">
  <div class="tile">
    <div class="v">${f.length}</div>
    <div class="k">Problemi distinti</div>
    <div class="n">da ${run.stats.evidenceCollected} evidenze grezze</div>
  </div>
  <div class="tile">
    <div class="v">${failCount}</div>
    <div class="k">Non conformità certe</div>
    <div class="n">verificabili in modo deterministico</div>
  </div>
  <div class="tile">
    <div class="v">${reviewCount}</div>
    <div class="k">Da verificare</div>
    <div class="n">richiedono giudizio umano</div>
  </div>
  <div class="tile">
    <div class="v">${run.templates.length}</div>
    <div class="k">Template distinti</div>
    <div class="n">su ${totalPagesInEcosystem.toLocaleString('it-IT')} pagine dell'ecosistema</div>
  </div>
  <div class="tile">
    <div class="v">${compression}×</div>
    <div class="k">Compressione</div>
    <div class="n">${scannedPages} pagine scansionate</div>
  </div>
  <div class="tile">
    <div class="v">${run.sites.length}</div>
    <div class="k">Siti analizzati</div>
    <div class="n">${esc(run.sites.filter((s) => s.tier === 'primary').length)} touchpoint primari</div>
  </div>
</div>

<h2>Distribuzione per severità</h2>
<div class="bars">
  ${(['critica', 'alta', 'media', 'bassa'] as const)
    .map((b) => {
      const meta = BAND_META[b];
      const n = bands[b];
      const pct = Math.round((n / maxBand) * 100);
      return `<div class="bar-row">
    <div class="bar-label"><span class="dot" style="background:${meta.color}"></span>${meta.label}</div>
    <div class="bar-track">${n > 0 ? `<div class="bar-fill" style="width:${pct}%;background:${meta.color}"></div>` : ''}</div>
    <div class="bar-val">${n}</div>
  </div>`;
    })
    .join('\n  ')}
</div>

<h2>Come leggere questo rapporto</h2>
<div class="note">
  <p style="margin-top:0"><strong>Un problema, non un'occorrenza.</strong> Ogni voce dell'elenco raggruppa tutte le occorrenze dello stesso difetto sullo stesso componente: correggere il componente una volta chiude l'intero gruppo. Il numero di occorrenze indica l'impatto stimato sull'ecosistema, non quante correzioni servono.</p>
  <p><strong>"Da verificare" non significa incerto o secondario.</strong> Circa metà dei criteri WCAG non è verificabile da una macchina: richiede il giudizio di una persona. Il motore isola i casi sospetti e formula la domanda a cui rispondere, ma la decisione resta umana. Un rapporto che dichiarasse conformità su questi criteri non sarebbe difendibile.</p>
  <p style="margin-bottom:0"><strong>I criteri WCAG 2.2</strong> sono segnalati con bordo tratteggiato: sono raccomandazioni forward-looking, non fanno parte della baseline di conformità vincolante finché la norma armonizzata europea non verrà aggiornata.</p>
</div>

<h2>Elenco dei problemi</h2>

<form class="filters" role="search" aria-label="Filtra i problemi">
  <div class="field">
    <label for="f-q">Cerca</label>
    <input type="search" id="f-q" placeholder="titolo, componente, criterio…">
  </div>
  <div class="field">
    <label for="f-verdict">Esito</label>
    <select id="f-verdict">
      <option value="">Tutti</option>
      <option value="fail">Non conforme</option>
      <option value="needs-review">Da verificare</option>
    </select>
  </div>
  <div class="field">
    <label for="f-band">Severità</label>
    <select id="f-band">
      <option value="">Tutte</option>
      <option value="critica">Critica</option>
      <option value="alta">Alta</option>
      <option value="media">Media</option>
      <option value="bassa">Bassa</option>
    </select>
  </div>
  <div class="field">
    <label for="f-site">Sito</label>
    <select id="f-site"><option value="">Tutti</option>${siteOptions}</select>
  </div>
  <div class="field">
    <label for="f-owner">Competenza</label>
    <select id="f-owner">
      <option value="">Tutte</option>
      <option value="frontend">Frontend</option>
      <option value="contenuti">Contenuti</option>
      <option value="design">Design</option>
      <option value="cms">CMS</option>
    </select>
  </div>
</form>

<p class="count" id="count" role="status" aria-live="polite">${f.length} problemi</p>

<div id="list">
${findingCards}
</div>

<h2>Vista tabellare</h2>
<p class="meta" style="margin-bottom:12px">Gli stessi dati in forma compatta, per chi preferisce leggerli in tabella o esportarli.</p>
<div class="table-wrap">
  <table>
    <caption class="sr-only" style="position:absolute;left:-9999px">Elenco completo dei problemi rilevati</caption>
    <thead>
      <tr>
        <th scope="col">Problema</th><th scope="col">Esito</th><th scope="col">Severità</th>
        <th scope="col" class="num">Punteggio</th><th scope="col">Criteri</th>
        <th scope="col">Componente</th><th scope="col" class="num">Occorrenze</th><th scope="col">Competenza</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
</div>

</main>

<footer>
  <p>Generato da Hinto A11y Engine ${esc(run.engineVersion)} · motore deterministico axe-core ${esc(run.axeVersion)} (MPL-2.0) su Playwright (MIT).</p>
  <p>La copertura automatica dei criteri WCAG si attesta intorno al 30-57% a seconda dello studio: questo rapporto non sostituisce la verifica con tecnologie assistive né la validazione di un esperto, e non costituisce di per sé dichiarazione di conformità.</p>
</footer>
</div>

<script>
(function () {
  var q = document.getElementById('f-q');
  var verdict = document.getElementById('f-verdict');
  var band = document.getElementById('f-band');
  var site = document.getElementById('f-site');
  var owner = document.getElementById('f-owner');
  var count = document.getElementById('count');
  var items = Array.prototype.slice.call(document.querySelectorAll('#list .finding'));

  function apply() {
    var qv = q.value.trim().toLowerCase();
    var shown = 0;
    items.forEach(function (el) {
      var ok = true;
      if (verdict.value && el.dataset.verdict !== verdict.value) ok = false;
      if (ok && band.value && el.dataset.band !== band.value) ok = false;
      if (ok && site.value && el.dataset.sites.split(',').indexOf(site.value) === -1) ok = false;
      if (ok && owner.value && el.dataset.owner !== owner.value) ok = false;
      if (ok && qv && el.dataset.search.indexOf(qv) === -1) ok = false;
      el.hidden = !ok;
      if (ok) shown++;
    });
    count.textContent = shown === items.length
      ? shown + ' problemi'
      : shown + ' problemi su ' + items.length;
  }

  [q, verdict, band, site, owner].forEach(function (el) {
    el.addEventListener('input', apply);
    el.addEventListener('change', apply);
  });
  document.querySelector('.filters').addEventListener('submit', function (e) { e.preventDefault(); });
})();
</script>
</body>
</html>`;
}

function renderFinding(
  x: Finding,
  index: number,
  evidenceById: Map<string, Evidence>,
  siteById: Map<string, { label: string }>,
  templateByFp: Map<string, { label: string; pageCount: number }>,
  shots: Map<string, string>,
): string {
  const band = BAND_META[x.severity.band];
  const verdictMeta = VERDICT_META[x.verdict];
  const verdictClass = x.verdict === 'fail' ? 'v-fail' : 'v-review';

  const criteriaChips = x.criteria
    .map((c) => {
      const crit = getCriterion(c);
      const fwd = !isBaseline(c);
      const title = crit ? `${c} ${crit.title}${fwd ? ' (WCAG 2.2, raccomandazione)' : ''}` : c;
      return `<span class="chip wcag${fwd ? ' fwd' : ''}" title="${esc(title)}">${esc(c)}</span>`;
    })
    .join('');

  const samples = x.evidenceIds
    .slice(0, 5)
    .map((id) => evidenceById.get(id))
    .filter((e): e is Evidence => !!e);

  /**
   * L'evidenza visiva senza didascalia non si legge.
   *
   * Prima l'immagine compariva nuda fra "Come si corregge" e "Dove si trova",
   * senza titolo e senza dire da quale pagina venisse. Su un rapporto vero
   * l'utente non l'ha nemmeno notata. Un ritaglio di pochi pixel ha bisogno di
   * dire COSA mostra e DOVE e' stato preso, altrimenti e' rumore.
   */
  const shotId = x.evidenceIds.find((id) => shots.has(id));
  const shotEv = shotId ? evidenceById.get(shotId) : undefined;
  const shotHtml = shotId
    ? `<h4>Evidenza visiva</h4>
    <figure class="shot-wrap">
      <img class="shot" src="${shots.get(shotId)}" alt="Schermata dell'elemento interessato dal problema: ${esc(x.title)}">
      <figcaption>Elemento osservato${
        shotEv?.pageUrl
          ? ` su <a href="${esc(shotEv.pageUrl)}" target="_blank" rel="noopener">${esc(
              shortUrl(shotEv.pageUrl),
            )}</a>`
          : ''
      }${shotEv?.selector ? ` — <code>${esc(shotEv.selector)}</code>` : ''}</figcaption>
    </figure>`
    : `<h4>Evidenza visiva</h4>
    <p class="shot-none">Non catturata per questo problema. Gli screenshot si limitano a un numero massimo per pagina, e alcuni difetti (contrasto al passaggio, ordine di tabulazione, reflow) non si vedono in un fermo immagine.</p>`;

  const templateLabels = x.fingerprints
    .map((fp) => templateByFp.get(fp))
    .filter(Boolean)
    .map((t) => `${esc(t!.label)} (${t!.pageCount} pagine)`)
    .join(', ');

  const siteLabels = x.siteIds.map((s) => siteById.get(s)?.label ?? s).join(', ');

  const searchIndex = [x.title, x.component, x.criteria.join(' '), x.description, x.owner]
    .join(' ')
    .toLowerCase();

  return `<details class="finding" data-band="${esc(x.severity.band)}" data-verdict="${esc(x.verdict)}"
    data-sites="${esc(x.siteIds.join(','))}" data-owner="${esc(x.owner)}"
    data-search="${esc(searchIndex)}"${index < 3 ? ' open' : ''}>
  <summary>
    <div class="sum-main">
      <div class="sum-title">${esc(x.title)}</div>
      <div class="chips">
        <span class="chip ${verdictClass}" title="${esc(verdictMeta?.hint ?? '')}">${esc(verdictMeta?.label ?? x.verdict)}</span>
        ${criteriaChips}
        <span class="chip">${x.occurrenceCount.toLocaleString('it-IT')} occorrenze stimate</span>
        <span class="chip">${esc(x.owner)}</span>
        <span class="chip">impegno ${esc(x.effort)}</span>
      </div>
    </div>
    <div class="sum-side">
      <div class="band-tag" style="color:${band.color}">
        <span class="dot" style="background:${band.color}"></span>${band.label}
      </div>
      <div class="score">punteggio ${x.severity.score}</div>
    </div>
  </summary>

  <div class="body">
    <h4>Cosa succede</h4>
    <p>${esc(x.description)}</p>

    <h4>Come si corregge</h4>
    <p>${esc(x.remediation).replace(/\n/g, '<br>')}</p>
    ${x.codeExample ? `<pre><code>${esc(x.codeExample)}</code></pre>` : ''}
    ${shotHtml}

    <h4>Dove si trova</h4>
    <div class="kv">
      <div><span>Componente</span><code>${esc(x.component)}</code></div>
      <div><span>Siti</span>${esc(siteLabels)}</div>
      <div><span>Template</span>${esc(templateLabels || 'non classificato')}</div>
      <div><span>Pagine osservate</span>${x.pageCount}</div>
      <div><span>Fiducia del rilevamento</span>${Math.round(x.confidence * 100)}%</div>
      <div><span>Punteggio severità</span>${x.severity.score} — impatto ${x.severity.userImpact}, diffusione ${x.severity.reach}, esposizione ${x.severity.legalExposure}</div>
    </div>

    <h4>Evidenze (${samples.length} di ${x.evidenceIds.length})</h4>
    <ul class="samples">
      ${samples
        .map(
          (e) => `<li>
        <a href="${esc(e.pageUrl)}" target="_blank" rel="noopener">${esc(e.pageUrl)}</a>
        <div>${esc(e.observation)}</div>
        ${e.selector ? `<code>${esc(e.selector)}</code>` : ''}
      </li>`,
        )
        .join('\n      ')}
    </ul>
    ${
      x.verdict === 'needs-review'
        ? `<h4>Verifica richiesta</h4>
    <div class="review-q">Questo criterio non è decidibile in modo automatico. Un revisore deve confermare guardando la pagina: ${esc(
      getCriterion(x.criteria[0])?.plainLanguage ?? 'verificare il comportamento reale del componente.',
    )}</div>`
        : ''
    }
  </div>
</details>`;
}
