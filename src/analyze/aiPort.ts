/**
 * La porta AI.
 *
 * Questo file esiste per una ragione sola: rendere il trasporto verso il
 * modello un DETTAGLIO DI IMPLEMENTAZIONE. Nel POC il pacchetto lo incolla
 * una persona; domani lo manda l'SDK. In mezzo non deve cambiare nulla della
 * pipeline, e per garantirlo il contratto e' fissato qui e validato a runtime:
 *
 *      EvidencePack  --[ qualunque trasporto ]-->  TriageResult
 *
 * Regola non negoziabile: il modello NON puo' promuovere un verdetto. Puo'
 * declassare un `fail` a `needs-review`, puo' riscrivere i testi, puo'
 * raggruppare - ma non puo' trasformare un `needs-review` in `fail`, perche'
 * il tetto lo stabilisce la natura del criterio, non il parere del modello.
 * La funzione `applyTriage` fa rispettare questa regola a valle, cosi' vale
 * anche se il prompt viene modificato o il modello sbaglia.
 */
import { z } from 'zod';
import type { Evidence, Finding } from '../core/types.js';
import { getCriterion } from '../core/wcag.js';

export const PACK_SCHEMA_VERSION = '1.0';

/* ------------------------------------------------------------------ *
 * Contratto in ingresso
 * ------------------------------------------------------------------ */

export const PackFinding = z.object({
  id: z.string(),
  checkId: z.string(),
  title: z.string(),
  criteria: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      level: z.string(),
      automation: z.string(),
      plainLanguage: z.string(),
    }),
  ),
  proposedVerdict: z.string(),
  /** Tetto invalicabile: il modello non puo' andare oltre questo verdetto */
  maxVerdict: z.string(),
  confidence: z.number(),
  component: z.string(),
  occurrenceCount: z.number(),
  pageCount: z.number(),
  siteIds: z.array(z.string()),
  /** Campioni concreti su cui ragionare */
  samples: z.array(
    z.object({
      pageUrl: z.string(),
      selector: z.string(),
      html: z.string(),
      observation: z.string(),
      data: z.record(z.string(), z.unknown()),
    }),
  ),
  currentDescription: z.string(),
  currentRemediation: z.string(),
});
export type PackFinding = z.infer<typeof PackFinding>;

export const EvidencePack = z.object({
  schemaVersion: z.literal(PACK_SCHEMA_VERSION),
  packId: z.string(),
  packIndex: z.number().int(),
  packTotal: z.number().int(),
  project: z.string(),
  standard: z.string(),
  findings: z.array(PackFinding),
});
export type EvidencePack = z.infer<typeof EvidencePack>;

/* ------------------------------------------------------------------ *
 * Contratto in uscita
 * ------------------------------------------------------------------ */

export const TriagedFinding = z.object({
  id: z.string(),
  /** Il modello puo' solo confermare o declassare */
  verdict: z.enum(['fail', 'needs-review', 'pass', 'inapplicable']),
  confidence: z.number().min(0).max(1),
  /** Titolo riscritto in italiano, comprensibile a un non esperto */
  title: z.string(),
  description: z.string(),
  remediation: z.string(),
  codeExample: z.string().optional(),
  owner: z.enum(['frontend', 'contenuti', 'design', 'cms', 'fornitore-terzo', 'da-definire']),
  effort: z.enum(['basso', 'medio', 'alto']),
  /** Perche' il modello ha deciso cosi': finisce nel log, non nel report */
  rationale: z.string(),
  /** Domanda secca da porre al revisore umano, se serve */
  reviewQuestion: z.string().optional(),
});
export type TriagedFinding = z.infer<typeof TriagedFinding>;

export const TriageResult = z.object({
  schemaVersion: z.literal(PACK_SCHEMA_VERSION),
  packId: z.string(),
  findings: z.array(TriagedFinding),
});
export type TriageResult = z.infer<typeof TriageResult>;

/* ------------------------------------------------------------------ *
 * L'interfaccia
 * ------------------------------------------------------------------ */

export interface TriageAdapter {
  readonly name: string;
  /**
   * Riceve i pacchetti, restituisce i risultati validati.
   * Puo' essere sincrono (API) o differito (manuale): la pipeline attende
   * comunque una Promise, quindi i due casi sono indistinguibili a monte.
   */
  triage(packs: EvidencePack[]): Promise<TriageResult[]>;
}

/* ------------------------------------------------------------------ *
 * Costruzione dei pacchetti
 * ------------------------------------------------------------------ */

export interface PackOptions {
  /**
   * Finding per pacchetto. Va tenuto basso: e' cio' che rende la migrazione
   * da incolla-a-mano ad API indolore, perche' la dimensione del batch non
   * cambia quando cambia il trasporto.
   */
  findingsPerPack: number;
  /** Campioni di evidenza allegati a ciascun finding */
  samplesPerFinding: number;
  /** Salta i finding gia' certi e a bassa severita': non serve spenderci un modello */
  skipObvious: boolean;
}

export const DEFAULT_PACK: PackOptions = {
  findingsPerPack: 12,
  samplesPerFinding: 3,
  skipObvious: true,
};

export function buildPacks(
  findings: Finding[],
  evidence: Evidence[],
  project: string,
  standard: string,
  opts: PackOptions = DEFAULT_PACK,
): EvidencePack[] {
  const evidenceById = new Map(evidence.map((e) => [e.id, e]));

  const candidates = findings.filter((f) => {
    if (!opts.skipObvious) return true;
    // un fallimento deterministico ad alta fiducia non ha bisogno di ragionamento:
    // il testo di remediation esiste gia' e il verdetto non e' in discussione
    const obvious = f.verdict === 'fail' && f.confidence >= 0.95 && f.severity.band === 'bassa';
    return !obvious;
  });

  const packFindings: PackFinding[] = candidates.map((f) => ({
    id: f.id,
    checkId: f.evidenceIds.length ? (evidenceById.get(f.evidenceIds[0])?.checkId ?? '') : '',
    title: f.title,
    criteria: f.criteria.map((id) => {
      const c = getCriterion(id);
      return {
        id,
        title: c?.title ?? 'criterio non in catalogo',
        level: c?.level ?? '?',
        automation: c?.automation ?? 'judgment',
        plainLanguage: c?.plainLanguage ?? '',
      };
    }),
    proposedVerdict: f.verdict,
    maxVerdict: f.criteria.some((c) => getCriterion(c)?.automation === 'deterministic')
      ? 'fail'
      : 'needs-review',
    confidence: f.confidence,
    component: f.component,
    occurrenceCount: f.occurrenceCount,
    pageCount: f.pageCount,
    siteIds: f.siteIds,
    samples: f.evidenceIds
      .slice(0, opts.samplesPerFinding)
      .map((id) => evidenceById.get(id))
      .filter((e): e is Evidence => !!e)
      .map((e) => ({
        pageUrl: e.pageUrl,
        selector: e.selector,
        html: e.html.slice(0, 600),
        observation: e.observation,
        data: e.data,
      })),
    currentDescription: f.description,
    currentRemediation: f.remediation,
  }));

  const packs: EvidencePack[] = [];
  const total = Math.ceil(packFindings.length / opts.findingsPerPack) || 1;
  for (let i = 0; i < packFindings.length; i += opts.findingsPerPack) {
    const idx = Math.floor(i / opts.findingsPerPack);
    packs.push({
      schemaVersion: PACK_SCHEMA_VERSION,
      packId: `pack-${String(idx + 1).padStart(3, '0')}`,
      packIndex: idx + 1,
      packTotal: total,
      project,
      standard,
      findings: packFindings.slice(i, i + opts.findingsPerPack),
    });
  }

  return packs;
}

/* ------------------------------------------------------------------ *
 * Applicazione dei risultati
 * ------------------------------------------------------------------ */

const VERDICT_RANK: Record<string, number> = {
  fail: 0,
  'needs-review': 1,
  pass: 2,
  inapplicable: 3,
};

/**
 * Fonde il triage nei finding, facendo rispettare il tetto.
 *
 * Il controllo qui e' volutamente ridondante rispetto al prompt: un prompt
 * si puo' modificare per sbaglio, un modello puo' sbagliare. Il vincolo
 * normativo deve vivere nel codice.
 */
export function applyTriage(
  findings: Finding[],
  results: TriageResult[],
): { findings: Finding[]; applied: number; rejected: string[] } {
  const byId = new Map<string, TriagedFinding>();
  for (const r of results) for (const f of r.findings) byId.set(f.id, f);

  const rejected: string[] = [];
  let applied = 0;

  const merged = findings.map((f) => {
    const t = byId.get(f.id);
    if (!t) return f;

    const maxVerdict: string = f.criteria.some(
      (c) => getCriterion(c)?.automation === 'deterministic',
    )
      ? 'fail'
      : 'needs-review';

    // il modello non puo' rendere un verdetto PIU' forte del tetto del criterio
    let verdict = t.verdict;
    if (VERDICT_RANK[verdict] < VERDICT_RANK[maxVerdict]) {
      rejected.push(
        `${f.id}: verdetto "${t.verdict}" rifiutato, il criterio non e' deterministico (tetto: ${maxVerdict})`,
      );
      verdict = maxVerdict as Finding['verdict'];
    }

    applied++;
    return {
      ...f,
      verdict,
      confidence: t.confidence,
      title: t.title || f.title,
      description: t.description || f.description,
      remediation: t.remediation || f.remediation,
      codeExample: t.codeExample ?? f.codeExample,
      owner: t.owner,
      effort: t.effort,
      aiGenerated: true,
    } satisfies Finding;
  });

  return { findings: merged, applied, rejected };
}
