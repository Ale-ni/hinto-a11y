/**
 * Modello di dominio del motore di audit.
 *
 * Tutto il sistema gira attorno a due idee:
 *
 *  1. L'unita' di analisi non e' la PAGINA ma il COMPONENTE dentro un TEMPLATE.
 *     Un header rotto condiviso da 15 siti e' UN finding, non 15 x N pagine.
 *
 *  2. Il confine fra automazione e giudizio umano e' esplicito e tracciato nel
 *     dato stesso (campo `verdict`): nessun finding puo' essere dichiarato
 *     "fallimento" da una macchina se il criterio non e' deterministico.
 *
 * Gli schemi zod sono la fonte di verita': i tipi TS ne derivano. Questo serve
 * soprattutto alla porta AI, dove il contratto deve essere validato a runtime
 * perche' l'input arriva da fuori (incollato a mano nel POC, da API domani).
 */
import { z } from 'zod';

/* ------------------------------------------------------------------ *
 * Conformita'
 * ------------------------------------------------------------------ */

/** Livello di conformita' WCAG. La baseline normativa italiana e' A + AA. */
export const ConformanceLevel = z.enum(['A', 'AA', 'AAA']);
export type ConformanceLevel = z.infer<typeof ConformanceLevel>;

/**
 * Esito di una verifica su un criterio.
 *
 * `needs-review` non e' un ripiego: e' la coda di lavoro dell'esperto ed e'
 * l'unica parte del backlog che costa tempo umano. Tenerla piccola e ben
 * motivata e' l'obiettivo di tutto il layer di analisi.
 */
export const Verdict = z.enum([
  'fail', // fallimento certo, verificabile in modo deterministico
  'needs-review', // sospetto: serve giudizio umano per confermare
  'pass', // verificato conforme
  'inapplicable', // il criterio non si applica a questo contenuto
]);
export type Verdict = z.infer<typeof Verdict>;

/** Da dove arriva l'osservazione: serve per tracciabilita' e per il report. */
export const EvidenceSource = z.enum([
  'axe-core', // motore deterministico
  'keyboard-walk', // percorso di tabulazione scriptato
  'structure', // outline heading, landmark, lang, title
  'media', // inventario alt text
  'links', // inventario testi dei link
  'contrast-states', // contrasto su hover/focus/visited
  'reflow', // 320px, zoom 200%, orientamento
  'forms', // label, errori, autocomplete
  'manual', // inserito da un operatore umano
]);
export type EvidenceSource = z.infer<typeof EvidenceSource>;

/* ------------------------------------------------------------------ *
 * Criteri WCAG
 * ------------------------------------------------------------------ */

export const WcagCriterion = z.object({
  /** Numero del criterio, es. "1.4.3" */
  id: z.string(),
  /** Titolo ufficiale in italiano */
  title: z.string(),
  level: ConformanceLevel,
  /** Principio: Percepibile / Utilizzabile / Comprensibile / Robusto */
  principle: z.enum(['percepibile', 'utilizzabile', 'comprensibile', 'robusto']),
  /**
   * Quanto il criterio e' verificabile da una macchina.
   * Guida il motore: su un criterio `judgment` nessun automatismo puo'
   * emettere `fail`, al massimo `needs-review`.
   */
  automation: z.enum([
    'deterministic', // la macchina decide da sola
    'partial', // la macchina restringe il campo, l'umano conferma
    'judgment', // solo giudizio umano
  ]),
  /** Spiegazione operativa, in italiano, per chi non conosce le WCAG */
  plainLanguage: z.string(),
  /** Chi ne subisce l'impatto: usato per pesare la severita' */
  affectedUsers: z.array(z.string()),
});
export type WcagCriterion = z.infer<typeof WcagCriterion>;

/* ------------------------------------------------------------------ *
 * Crawl e template
 * ------------------------------------------------------------------ */

export const SiteTarget = z.object({
  /** Identificativo breve, es. "univr-main" */
  id: z.string(),
  /** Nome leggibile, es. "Portale istituzionale" */
  label: z.string(),
  baseUrl: z.string().url(),
  /**
   * Rilevanza del touchpoint. Entra nel calcolo della severita': lo stesso
   * difetto sul portale principale pesa piu' che su un sito dipartimentale.
   */
  tier: z.enum(['primary', 'secondary']).default('secondary'),
  /** Pattern di URL da escludere (regex) */
  exclude: z.array(z.string()).default([]),
});
export type SiteTarget = z.infer<typeof SiteTarget>;

export const DiscoveredPage = z.object({
  url: z.string().url(),
  siteId: z.string(),
  title: z.string().default(''),
  /**
   * Firma strutturale della pagina. Pagine con la stessa firma condividono
   * il template: si auditano una volta sola.
   */
  fingerprint: z.string(),
  /** Profondita' dal punto di ingresso */
  depth: z.number().int().default(0),
  httpStatus: z.number().int().optional(),
  discoveredVia: z.enum(['sitemap', 'link', 'seed']).default('link'),
});
export type DiscoveredPage = z.infer<typeof DiscoveredPage>;

export const TemplateCluster = z.object({
  fingerprint: z.string(),
  /** Etichetta inferita, es. "Scheda corso", "Elenco notizie" */
  label: z.string(),
  siteIds: z.array(z.string()),
  pageCount: z.number().int(),
  /** URL effettivamente scansionati per rappresentare il cluster */
  samples: z.array(z.string().url()),
  /** Tutte le URL che ricadono nel cluster (serve a stimare l'impatto) */
  memberUrls: z.array(z.string().url()),
});
export type TemplateCluster = z.infer<typeof TemplateCluster>;

/* ------------------------------------------------------------------ *
 * Evidenze
 * ------------------------------------------------------------------ */

/**
 * Osservazione atomica prodotta da un check su una pagina.
 * E' volutamente "grezza": non contiene giudizio, solo fatti + contesto.
 * Il giudizio arriva dopo, nell'analyzer e nel triage.
 */
export const Evidence = z.object({
  id: z.string(),
  source: EvidenceSource,
  /** Codice del check che l'ha prodotta, es. "color-contrast" */
  checkId: z.string(),
  pageUrl: z.string().url(),
  siteId: z.string(),
  fingerprint: z.string(),
  /** Criteri WCAG potenzialmente coinvolti */
  criteria: z.array(z.string()).default([]),
  /** Selettore CSS dell'elemento */
  selector: z.string().default(''),
  /**
   * Firma del componente: deriva dalla posizione nei landmark + classi
   * stabili. E' la chiave su cui si deduplica fra pagine e fra siti.
   */
  componentSignature: z.string().default(''),
  /**
   * Materiale grezzo da cui la firma e' stata calcolata (catena di antenati).
   * Conservarlo e' cio' che permette a `a11y replay` di ricalcolare firme e
   * deduplica su una scansione salvata, senza rieseguire la scansione.
   */
  signatureInput: z.string().optional(),
  /** Frammento HTML, troncato */
  html: z.string().default(''),
  /** Descrizione fattuale di cosa e' stato osservato */
  observation: z.string(),
  /** Dati strutturati specifici del check (contrasto misurato, ecc.) */
  data: z.record(z.string(), z.unknown()).default({}),
  /** Gravita' dichiarata dal motore che l'ha prodotta, se presente */
  engineImpact: z.enum(['minor', 'moderate', 'serious', 'critical']).optional(),
  /** Path relativo dello screenshot dell'elemento, se catturato */
  screenshot: z.string().optional(),
});
export type Evidence = z.infer<typeof Evidence>;

/* ------------------------------------------------------------------ *
 * Finding
 * ------------------------------------------------------------------ */

export const SeverityBreakdown = z.object({
  /** 1-5: quanto blocca l'utente che ne subisce l'effetto */
  userImpact: z.number().min(0).max(5),
  /** 1-5: quanto e' diffuso nell'ecosistema */
  reach: z.number().min(0).max(5),
  /** 1-5: esposizione normativa (livello A pesa piu' di AA) */
  legalExposure: z.number().min(0).max(5),
  /** Punteggio composito 0-100 */
  score: z.number().min(0).max(100),
  /** Fascia derivata dal punteggio */
  band: z.enum(['critica', 'alta', 'media', 'bassa']),
});
export type SeverityBreakdown = z.infer<typeof SeverityBreakdown>;

/**
 * Un problema, non un'occorrenza. Raggruppa tutte le evidenze che
 * rappresentano lo stesso difetto sullo stesso componente.
 */
export const Finding = z.object({
  id: z.string(),
  /** Titolo sintetico, in italiano, comprensibile a un non esperto */
  title: z.string(),
  criteria: z.array(z.string()),
  verdict: Verdict,
  /**
   * Fiducia nel verdetto, 0-1. Un `fail` deterministico vale 1.
   * Sotto la soglia configurata il finding finisce in coda di revisione.
   */
  confidence: z.number().min(0).max(1),
  severity: SeverityBreakdown,
  /** Il componente responsabile, es. "header > nav.main-menu" */
  component: z.string(),
  /**
   * Tutti i componenti interessati. Alcuni difetti hanno una causa unica ma si
   * manifestano su piu' componenti (una regola CSS che rimuove l'outline del
   * focus ovunque): si risolvono con un solo intervento, quindi devono restare
   * un solo finding, ma il report deve poter dire dove si vedono.
   */
  components: z.array(z.string()).default([]),
  /** Template in cui compare */
  fingerprints: z.array(z.string()),
  siteIds: z.array(z.string()),
  /** Numero di occorrenze totali stimate nell'ecosistema */
  occurrenceCount: z.number().int(),
  /** Numero di pagine in cui e' stato osservato */
  pageCount: z.number().int(),
  evidenceIds: z.array(z.string()),
  /** Descrizione del problema in linguaggio piano */
  description: z.string().default(''),
  /** Cosa fare, operativo */
  remediation: z.string().default(''),
  /** Esempio di codice corretto, se applicabile */
  codeExample: z.string().optional(),
  /** Chi deve intervenire */
  owner: z
    .enum(['frontend', 'contenuti', 'design', 'cms', 'fornitore-terzo', 'da-definire'])
    .default('da-definire'),
  /** Stima di effort per la remediation */
  effort: z.enum(['basso', 'medio', 'alto']).default('medio'),
  /** True se il testo e' stato prodotto dal layer AI e non ancora validato */
  aiGenerated: z.boolean().default(false),
});
export type Finding = z.infer<typeof Finding>;

/* ------------------------------------------------------------------ *
 * Scansione
 * ------------------------------------------------------------------ */

export const ScanRun = z.object({
  id: z.string(),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  /** Nome del progetto/cliente */
  project: z.string(),
  engineVersion: z.string(),
  axeVersion: z.string(),
  /** Standard di riferimento dichiarato nel report */
  standard: z.string().default('WCAG 2.1 AA / EN 301 549 v3.2.1'),
  sites: z.array(SiteTarget),
  /** Classi ritenute strutturali durante il clustering */
  stableClasses: z.array(z.string()).default([]),
  /** id ritenuti strutturali: un id raro identifica un contenuto, non uno slot */
  stableIds: z.array(z.string()).default([]),
  /** Quota di classi con aspetto generato: diagnostica del sito analizzato */
  generatedClassRatio: z.number().default(0),
  pages: z.array(DiscoveredPage),
  templates: z.array(TemplateCluster),
  evidence: z.array(Evidence),
  findings: z.array(Finding),
  /** Autodiagnosi: anomalie dell'ANALISI, non del sito analizzato */
  quality: z
    .object({
      trustworthy: z.boolean().default(true),
      issues: z
        .array(
          z.object({
            kind: z.string(),
            severity: z.string(),
            message: z.string(),
            samples: z.array(z.string()).default([]),
          }),
        )
        .default([]),
    })
    .optional(),
  stats: z
    .object({
      pagesDiscovered: z.number().int().default(0),
      pagesScanned: z.number().int().default(0),
      templatesFound: z.number().int().default(0),
      evidenceCollected: z.number().int().default(0),
      findingsAfterDedupe: z.number().int().default(0),
      needsReviewCount: z.number().int().default(0),
      /** Fattore di compressione: evidenze grezze / finding. */
      dedupeRatio: z.number().default(1),
    })
    .default({
      pagesDiscovered: 0,
      pagesScanned: 0,
      templatesFound: 0,
      evidenceCollected: 0,
      findingsAfterDedupe: 0,
      needsReviewCount: 0,
      dedupeRatio: 1,
    }),
});
export type ScanRun = z.infer<typeof ScanRun>;
