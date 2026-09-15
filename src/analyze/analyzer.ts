/**
 * Da evidenze a finding.
 *
 * Qui succedono le due cose che rendono il backlog consegnabile:
 *
 *  1. DEDUPLICA PER COMPONENTE. 4.000 occorrenze di "focus non visibile"
 *     diventano un finding sul componente che le genera. Il cliente riceve
 *     un elenco di cose da sistemare nel tema, non un tabulato di URL.
 *
 *  2. TETTO AL VERDETTO AUTOMATICO. Nessun automatismo puo' dichiarare
 *     fallimento su un criterio che richiede giudizio: al massimo lo mette
 *     in coda di revisione. E' cio' che tiene il report difendibile.
 */
import { createHash } from 'node:crypto';
import type {
  Evidence,
  Finding,
  SeverityBreakdown,
  SiteTarget,
  TemplateCluster,
  Verdict,
} from '../core/types.js';
import { getCriterion, legalWeight, maxAutomatedVerdict } from '../core/wcag.js';
import { REMEDIATION, axeConfidence, type RemediationTemplate } from './remediation.js';
import { axeItalian } from './axeRules.it.js';

export interface AnalyzeOptions {
  /** Sotto questa soglia il finding entra comunque in coda di revisione */
  reviewThreshold: number;
  /** Numero massimo di evidenze citate per finding nel report */
  maxEvidencePerFinding: number;
}

export const DEFAULT_ANALYZE: AnalyzeOptions = {
  reviewThreshold: 0.75,
  maxEvidencePerFinding: 25,
};

/* ------------------------------------------------------------------ *
 * Severita'
 * ------------------------------------------------------------------ */

const IMPACT_SCORE: Record<string, number> = {
  critical: 5,
  serious: 3.5,
  moderate: 2,
  minor: 1,
};

/**
 * Punteggio composito.
 *
 * La taratura conta piu' della formula. Una scala che manda tutto in fascia
 * critica non ordina nulla ed e' peggio che inutile: il cliente la guarda una
 * volta, vede ventiquattro voci critiche e smette di fidarsi dell'intero
 * documento. Quindi l'impatto sull'utente pesa piu' di tutto il resto messo
 * insieme, e le soglie delle fasce sono alte di proposito: "critica" deve
 * voler dire che qualcuno non riesce proprio a fare quello che era venuto
 * a fare.
 */
function computeSeverity(
  evidences: Evidence[],
  criteria: string[],
  occurrenceCount: number,
  totalPages: number,
  siteTiers: Array<'primary' | 'secondary'>,
): SeverityBreakdown {
  const impacts = evidences.map((e) => IMPACT_SCORE[e.engineImpact ?? 'moderate'] ?? 2);
  const userImpact = Math.max(...impacts, 1);

  // diffusione: quota di pagine interessate, con una spinta se tocca un
  // touchpoint primario (lo stesso difetto sul portale principale pesa di piu')
  const coverage = totalPages > 0 ? occurrenceCount / totalPages : 0;
  let reach = coverage >= 0.8 ? 5 : coverage >= 0.4 ? 4 : coverage >= 0.15 ? 3 : coverage >= 0.05 ? 2 : 1;
  if (siteTiers.includes('primary')) reach = Math.min(5, reach + 0.5);

  const legalExposure = legalWeight(criteria);

  const score =
    Math.round(((userImpact / 5) * 55 + (reach / 5) * 25 + (legalExposure / 5) * 20) * 10) / 10;

  const band: SeverityBreakdown['band'] =
    score >= 85 ? 'critica' : score >= 68 ? 'alta' : score >= 45 ? 'media' : 'bassa';

  return {
    userImpact: Math.round(userImpact * 10) / 10,
    reach: Math.round(reach * 10) / 10,
    legalExposure,
    score,
    band,
  };
}

/* ------------------------------------------------------------------ *
 * Verdetto
 * ------------------------------------------------------------------ */

function decideVerdict(
  checkId: string,
  criteria: string[],
  confidence: number,
  opts: AnalyzeOptions,
): Verdict {
  // axe non e' riuscita a decidere: per definizione va rivisto a mano
  if (checkId.startsWith('axe-incomplete:')) return 'needs-review';

  // Il tetto e' dato dal criterio PIU' permissivo fra quelli coinvolti:
  // se anche uno solo e' deterministico, il fallimento e' dimostrabile.
  const caps = criteria.map((c) => maxAutomatedVerdict(c));
  const canFail = caps.includes('fail');

  if (!canFail) return 'needs-review';
  if (confidence < opts.reviewThreshold) return 'needs-review';
  return 'fail';
}

/* ------------------------------------------------------------------ *
 * Deduplica
 * ------------------------------------------------------------------ */

/**
 * Check con causa unica: si manifestano su molti componenti diversi ma si
 * risolvono con un singolo intervento (tipicamente una regola CSS globale o
 * una scelta di template). Raggrupparli per componente produrrebbe dieci voci
 * di backlog per una correzione sola, che e' il modo piu' rapido di far
 * sembrare disastroso un sito e di far perdere tempo a chi deve correggerlo.
 */
const SINGLE_ROOT_CAUSE = new Set([
  'focus-not-visible',
  'keyboard-positive-tabindex',
  'link-new-window-unannounced',
  'img-alt-is-filename',
  'img-alt-placeholder',
  'link-generic-text',
  'axe:meta-viewport',
  'axe:html-has-lang',
  'axe:duplicate-id',
]);

function groupKey(e: Evidence): string {
  if (SINGLE_ROOT_CAUSE.has(e.checkId)) return e.checkId;

  // Il contrasto fa eccezione: componenti diversi possono avere coppie di
  // colori diverse, che richiedono correzioni diverse. Raggruppiamo per
  // coppia di colori, cosi' una singola scelta di palette resta un finding.
  if (e.checkId === 'axe:color-contrast' || e.checkId === 'contrast-hover-insufficient') {
    const checks = (e.data.checks as Array<{ data?: Record<string, unknown> }> | undefined) ?? [];
    const cd = checks[0]?.data ?? {};
    const fg = String(cd.fgColor ?? e.data.restColor ?? '');
    const bg = String(cd.bgColor ?? '');
    if (fg || bg) return `${e.checkId}::${fg}|${bg}`;
  }

  // caso generale: stesso check + stesso componente = stesso problema
  const component = e.componentSignature || 'unknown';
  return `${e.checkId}::${component}`;
}

/**
 * Testi del finding. L'ordine di precedenza e' voluto: prima il nostro
 * catalogo italiano, poi la traduzione delle regole axe, e solo come ultima
 * risorsa il testo inglese di axe - che finisce nel report cosi' com'e' ed e'
 * il segnale che quella regola va aggiunta al catalogo.
 */
function templateFor(checkId: string): RemediationTemplate | undefined {
  if (REMEDIATION[checkId]) return REMEDIATION[checkId];
  const axeRule = checkId.replace(/^axe(-incomplete)?:/, '');
  if (checkId.startsWith('axe')) return axeItalian(axeRule);
  return undefined;
}

function titleFor(checkId: string, evidences: Evidence[]): string {
  const tpl = templateFor(checkId);
  if (tpl) {
    // Un "incomplete" di axe e' un dubbio, non un fallimento: il titolo deve
    // dirlo, altrimenti nel backlog sembra una non conformita' accertata.
    return checkId.startsWith('axe-incomplete:') ? `${tpl.title} (da verificare)` : tpl.title;
  }
  const first = evidences[0];
  const help = String(first.data.axeDescription ?? '').trim();
  if (help) return help.replace(/\.$/, '');
  return checkId.replace(/^axe(-incomplete)?:/, '').replace(/-/g, ' ');
}

export function analyze(
  evidence: Evidence[],
  templates: TemplateCluster[],
  sites: SiteTarget[],
  opts: AnalyzeOptions = DEFAULT_ANALYZE,
): Finding[] {
  const templateByFp = new Map(templates.map((t) => [t.fingerprint, t]));
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const totalPages = templates.reduce((n, t) => n + t.pageCount, 0) || evidence.length;

  const groups = new Map<string, Evidence[]>();
  for (const e of evidence) {
    const k = groupKey(e);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(e);
  }

  const findings: Finding[] = [];

  for (const [key, group] of groups) {
    const first = group[0];
    const checkId = first.checkId;
    const criteria = [...new Set(group.flatMap((e) => e.criteria))].sort();

    const components = [...new Set(group.map((e) => e.componentSignature).filter(Boolean))];
    const fingerprints = [...new Set(group.map((e) => e.fingerprint).filter(Boolean))];
    const siteIds = [...new Set(group.map((e) => e.siteId))];
    const pageUrls = [...new Set(group.map((e) => e.pageUrl))];

    /**
     * Estrapolazione onesta della diffusione: se il difetto sta in un
     * componente di un template che ha 300 pagine, le occorrenze reali
     * nell'ecosistema sono ~300, non le 3 che abbiamo campionato.
     * Senza questo passaggio la priorita' risulterebbe falsata verso il basso.
     */
    let occurrenceCount = 0;
    for (const fp of fingerprints) {
      const tpl = templateByFp.get(fp);
      occurrenceCount += tpl ? tpl.pageCount : 1;
    }
    if (occurrenceCount === 0) occurrenceCount = pageUrls.length;

    /* --- fiducia --- */
    const isAxe = checkId.startsWith('axe');
    const isIncomplete = checkId.startsWith('axe-incomplete:');
    const tpl = templateFor(checkId);
    let confidence: number;
    if (isAxe) {
      confidence = axeConfidence(String(first.data.axeRule ?? ''), isIncomplete);
    } else {
      confidence = tpl?.confidence ?? 0.5;
    }
    // piu' occorrenze indipendenti confermano il pattern
    if (pageUrls.length >= 3 && confidence < 0.95) confidence = Math.min(0.95, confidence + 0.05);

    const verdict = decideVerdict(checkId, criteria, confidence, opts);

    const siteTiers = siteIds.map((id) => siteById.get(id)?.tier ?? 'secondary');
    const severity = computeSeverity(group, criteria, occurrenceCount, totalPages, siteTiers);

    const id = createHash('sha1').update(key).digest('hex').slice(0, 12);

    findings.push({
      id,
      title: first.componentSignature.startsWith('terze-parti:')
        ? `${titleFor(checkId, group)} — ${first.componentSignature.replace('terze-parti:', '')}`
        : titleFor(checkId, group),
      criteria,
      verdict,
      confidence: Math.round(confidence * 100) / 100,
      severity,
      component:
        components.length > 1
          ? `${components[0]} e altri ${components.length - 1} componenti`
          : (components[0] ?? 'documento'),
      components,
      fingerprints,
      siteIds,
      occurrenceCount,
      pageCount: pageUrls.length,
      evidenceIds: group.slice(0, opts.maxEvidencePerFinding).map((e) => e.id),
      description: tpl?.description ?? deriveDescription(group),
      remediation: tpl?.remediation ?? deriveRemediation(group),
      codeExample: tpl?.codeExample,
      owner: first.componentSignature.startsWith('terze-parti:')
        ? 'fornitore-terzo'
        : (tpl?.owner ?? inferOwner(checkId, criteria)),
      effort: tpl?.effort ?? 'medio',
      aiGenerated: false,
    });
  }

  return findings.sort((a, b) => {
    // prima i fallimenti certi, poi per punteggio
    if (a.verdict !== b.verdict) {
      const rank: Record<string, number> = { fail: 0, 'needs-review': 1, pass: 2, inapplicable: 3 };
      return rank[a.verdict] - rank[b.verdict];
    }
    return b.severity.score - a.severity.score;
  });
}

function deriveDescription(group: Evidence[]): string {
  const first = group[0];
  const axeDesc = String(first.data.axeDescription ?? '').trim();
  if (axeDesc) return axeDesc;
  return first.observation;
}

function deriveRemediation(group: Evidence[]): string {
  const first = group[0];
  const url = String(first.data.helpUrl ?? '');
  const base = first.observation;
  return url ? `${base}\n\nRiferimento tecnico: ${url}` : base;
}

function inferOwner(checkId: string, criteria: string[]): Finding['owner'] {
  if (/alt|text|label|link|title/.test(checkId) && criteria.some((c) => c.startsWith('1.1') || c === '2.4.4'))
    return 'contenuti';
  if (/contrast|color/.test(checkId)) return 'design';
  return 'frontend';
}

/* ------------------------------------------------------------------ *
 * Statistiche
 * ------------------------------------------------------------------ */

export function summarize(evidence: Evidence[], findings: Finding[]) {
  const needsReview = findings.filter((f) => f.verdict === 'needs-review');
  return {
    evidenceCollected: evidence.length,
    findingsAfterDedupe: findings.length,
    needsReviewCount: needsReview.length,
    dedupeRatio: findings.length > 0 ? Math.round((evidence.length / findings.length) * 10) / 10 : 1,
    byBand: {
      critica: findings.filter((f) => f.severity.band === 'critica').length,
      alta: findings.filter((f) => f.severity.band === 'alta').length,
      media: findings.filter((f) => f.severity.band === 'media').length,
      bassa: findings.filter((f) => f.severity.band === 'bassa').length,
    },
    byVerdict: {
      fail: findings.filter((f) => f.verdict === 'fail').length,
      'needs-review': needsReview.length,
    },
  };
}
