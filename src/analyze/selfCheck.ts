/**
 * Autodiagnosi della scansione.
 *
 * Esiste per una ragione precisa e poco lusinghiera: sul primo sito reale il
 * motore ha prodotto tre volte di fila risultati sbagliati in modo PLAUSIBILE.
 * Finding duplicati, cluster che inghiottivano mezzo sito, firme instabili -
 * niente di tutto questo solleva un errore. Il numero in fondo alla scansione
 * sembrava sensato, e il difetto lo si scopriva solo leggendo a mano il
 * backlog. Ogni scoperta costava una scansione nuova all'utente.
 *
 * La regola generale dietro questo file: un motore che produce giudizi deve
 * sapere riconoscere le proprie patologie, perché chi legge il risultato non
 * ha modo di distinguere un output corretto da uno plausibile.
 *
 * Questi controlli non verificano l'accessibilita' del sito analizzato.
 * Verificano che l'ANALISI sia sana.
 */
import type { Evidence, Finding, ScanRun, TemplateCluster } from '../core/types.js';
import { looksLikeHashedWord, needsStrongEvidence } from '../core/identity.js';

export const QualityIssue = {
  duplicateFindings: 'duplicate-findings',
  fragmentedCheck: 'fragmented-check',
  unstableSignature: 'unstable-signature',
  mixedClusters: 'mixed-clusters',
  lowCoverage: 'low-coverage',
  untranslatedText: 'untranslated-text',
  pollutedPages: 'polluted-pages',
} as const;

export interface QualityFinding {
  kind: (typeof QualityIssue)[keyof typeof QualityIssue];
  severity: 'bloccante' | 'attenzione' | 'nota';
  message: string;
  /** Esempi concreti: servono a capire il problema senza aprire i dati */
  samples: string[];
}

export interface QualityReport {
  issues: QualityFinding[];
  /** true se nessun problema bloccante: i risultati sono consegnabili */
  trustworthy: boolean;
}

/* ------------------------------------------------------------------ *
 * Controlli
 * ------------------------------------------------------------------ */

/**
 * Lo stesso problema contato più volte perche' la firma non ha deduplicato.
 */
function checkDuplicates(run: ScanRun): QualityFinding | null {
  const { findings, evidence } = run;

  /**
   * Il conteggio delle occorrenze NON e' un indizio di duplicazione.
   *
   * Era l'assunto della prima versione ("due componenti distinti non producono
   * mai conteggi identici") e su un sito vero e' semplicemente falso. Tutto
   * cio' che sta nel guscio condiviso - header, menu, footer - compare su ogni
   * pagina, quindi il suo conteggio e' una funzione del numero di pagine e non
   * del componente. Su 88 pagine, cinque componenti diversi dell'header
   * risultavano tutti a 628 occorrenze. Il controllo segnalava nove gruppi, di
   * cui sei erano coincidenze.
   *
   * Il vero duplicato ha una forma riconoscibile: stessa SEQUENZA DI TAG dalla
   * radice alla foglia, e differenza confinata a un identificatore che non
   * descrive una struttura - un id che compare su una pagina sola, una classe
   * generata, un `false` finito nell'attributo class per un errore di
   * template. Se i tag differiscono sono due elementi diversi; se gli
   * identificatori che differiscono sono entrambi solidi, sono due slot
   * diversi che si somigliano.
   */
  const pages = Math.max(run.stats.pagesScanned, 1);

  /** Su quante pagine distinte compare ciascun identificatore. */
  const pagesPerId = new Map<string, Set<string>>();
  for (const e of evidence) {
    const url = e.pageUrl ?? '';
    for (const m of String(e.componentSignature).matchAll(/[.#][A-Za-z0-9_:-]+/g)) {
      if (!pagesPerId.has(m[0])) pagesPerId.set(m[0], new Set());
      pagesPerId.get(m[0])!.add(url);
    }
  }
  /** Soglia deliberatamente bassa: si segnala solo cio' che e' palesemente locale. */
  const isWeakId = (id: string | null): boolean =>
    id !== null && (pagesPerId.get(id)?.size ?? 0) / pages < 0.15;

  const skeleton = (c: string) =>
    c.split(' > ').map((d) => d.replace(/[.#[].*$/, '')).join('>');
  const decoration = (c: string) =>
    c.split(' > ').map((d) => d.match(/[.#][A-Za-z0-9_:-]+/)?.[0] ?? null);

  const byShape = new Map<string, Finding[]>();
  for (const f of findings) {
    const key = `${f.title}::${skeleton(f.component)}`;
    if (!byShape.has(key)) byShape.set(key, []);
    byShape.get(key)!.push(f);
  }

  const samples: string[] = [];
  let groups = 0;
  for (const group of byShape.values()) {
    if (group.length < 2) continue;
    let flagged = false;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = decoration(group[i].component);
        const b = decoration(group[j].component);
        const diff = a.map((x, k) => [x, b[k]] as const).filter(([x, y]) => x !== y);
        if (!diff.length) continue;
        if (!diff.every(([x, y]) => isWeakId(x) || isWeakId(y))) continue;
        flagged = true;
        if (samples.length < 6) {
          samples.push(
            `"${group[i].title.slice(0, 44)}" — ${diff
              .map(([x, y]) => `${x ?? '(nessuno)'} vs ${y ?? '(nessuno)'}`)
              .join(', ')}\n        ${group[i].component}\n        ${group[j].component}`,
          );
        }
      }
    }
    if (flagged) groups++;
  }
  if (groups === 0) return null;

  return {
    kind: QualityIssue.duplicateFindings,
    severity: 'bloccante',
    message:
      `${groups} gruppi di finding descrivono lo stesso punto della pagina e differiscono ` +
      `solo per un identificatore non strutturale (un id presente su una pagina sola, una ` +
      `classe generata). Sono lo stesso problema contato più volte: la firma non sta ` +
      `deduplicando.`,
    samples,
  };
}

/**
 * Un check che genera molti finding distinti segnala frammentazione: lo stesso
 * difetto spezzato su firme diverse. La soglia e' larga perche' alcuni check
 * legittimamente toccano componenti diversi (il contrasto, per coppia di colori).
 */
function checkFragmentation(
  findings: Finding[],
  evidence: Evidence[],
  threshold = 6,
): QualityFinding | null {
  const evById = new Map(evidence.map((e) => [e.id, e]));
  const perCheck = new Map<string, Finding[]>();
  for (const f of findings) {
    const checkId = evById.get(f.evidenceIds[0])?.checkId;
    if (!checkId) continue;
    if (!perCheck.has(checkId)) perCheck.set(checkId, []);
    perCheck.get(checkId)!.push(f);
  }

  const fragmented = [...perCheck.entries()]
    .filter(([checkId, fs]) => fs.length > threshold && !checkId.includes('color-contrast'))
    .sort((a, b) => b[1].length - a[1].length);
  if (fragmented.length === 0) return null;

  return {
    kind: QualityIssue.fragmentedCheck,
    severity: 'attenzione',
    message:
      `${fragmented.length} controlli producono più di ${threshold} finding distinti. ` +
      `Può essere legittimo, ma spesso indica che lo stesso difetto è stato ` +
      `spezzato su componenti che il motore non riconosce come identici.`,
    samples: fragmented
      .slice(0, 5)
      .map(([checkId, fs]) => `${checkId}: ${fs.length} finding`),
  };
}

/**
 * Classi con l'aspetto di hash rimaste dentro le firme: e' la causa radice
 * della deduplica che non collassa. Meglio saperlo subito che scoprirlo
 * leggendo il backlog.
 */
function checkSignatureStability(findings: Finding[]): QualityFinding | null {
  const suspicious = new Set<string>();
  for (const f of findings) {
    for (const m of f.component.matchAll(/\.([A-Za-z0-9_-]+)/g)) {
      const cls = m[1];
      if (!needsStrongEvidence(cls)) continue;
      if (looksLikeHashedWord(cls)) suspicious.add(cls);
    }
  }
  if (suspicious.size === 0) return null;

  return {
    kind: QualityIssue.unstableSignature,
    severity: suspicious.size > 5 ? 'bloccante' : 'attenzione',
    message:
      `${suspicious.size} classi con aspetto di hash generato compaiono ancora nelle ` +
      `firme dei componenti. Le firme non saranno stabili fra build successive del ` +
      `sito, e la deduplica puo' non collassare difetti identici.`,
    samples: [...suspicious].slice(0, 12),
  };
}

/**
 * Cluster a struttura non uniforme.
 *
 * La prima versione bloccava sopra il 70% di pagine in cluster misti e
 * segnalava sopra il 35%. Su un sito editoriale vero ha bloccato all'81%, e
 * guardando i dati aveva torto: i dieci cluster misti erano `/it/blog/*`,
 * `/en/blog/*`, `/it/eventi/*`, `/it/portfolio/*` e simili - cioe' il
 * raggruppamento CORRETTO. Sono marcati "non uniformi" perche' il corpo di un
 * articolo varia davvero: uno ha una galleria, un altro un blocco di codice, un
 * terzo una fisarmonica. Non e' una patologia del clustering, e' com'e' fatto
 * un blog.
 *
 * Bloccare su una condizione normale e' il modo piu' rapido di insegnare a
 * ignorare l'autodiagnosi, che e' esattamente il difetto appena corretto nel
 * controllo sui duplicati.
 *
 * La patologia vera e' un'altra, ed e' gia' stata osservata: il clustering che
 * COLLASSA, con un unico cluster misto che si mangia gran parte del sito (due
 * pagine 404 che sbilanciavano la radice dell'albero degli URL).
 *
 * Anche la seconda versione era sbagliata, e per lo stesso motivo della prima:
 * riconosceva il collasso dalla sola QUOTA di pagine nel cluster piu' grande,
 * soglia 60%, tarata di nuovo su un sito solo. Sul sito successivo - 28 pagine,
 * di cui 18 articoli di notizie - ha bloccato al 64%. Guardando i dati aveva
 * torto un'altra volta: quel cluster era interamente `/news/`, cioe' il
 * raggruppamento corretto di un sito piccolo fatto quasi tutto di notizie.
 *
 * La quota non distingue le due situazioni, perche' su un sito monotematico un
 * template PUO' legittimamente coprire i due terzi delle pagine. Cio' che le
 * distingue e' l'OMOGENEITA' del cluster: quando il clustering collassa, nello
 * stesso bucket finiscono pagine di sezioni che non c'entrano nulla fra loro
 * (`/it/blog`, `/it/eventi`, `/intranet`, `/webmail` tutte insieme); quando
 * funziona, il cluster grande appartiene a una sezione sola.
 *
 * Si guarda quindi quante sezioni di primo livello copre, non quanto e' grande.
 * E sotto una certa dimensione del sito non si blocca affatto: su ventotto
 * pagine le percentuali sono rumore.
 *
 * Nota sul messaggio: la vecchia versione diceva che "le stime di diffusione
 * sono poco affidabili". Non e' vero - il numero di pagine per pattern di URL
 * e' esatto. Il costo reale e' un altro: un cluster misto viene campionato piu'
 * fitto, quindi la scansione e' piu' lunga.
 */
function checkMixedClusters(templates: TemplateCluster[]): QualityFinding | null {
  const total = templates.reduce((n, t) => n + t.pageCount, 0);
  if (total === 0) return null;
  const mixed = templates
    .filter((t) => t.fingerprint.startsWith('mixed-'))
    .sort((a, b) => b.pageCount - a.pageCount);
  if (mixed.length === 0) return null;

  const mixedPages = mixed.reduce((n, t) => n + t.pageCount, 0);
  const share = mixedPages / total;
  const largestShare = mixed[0].pageCount / total;

  /** Sezioni di primo livello toccate da un cluster: `/news/x` -> "news". */
  const sezioni = (t: TemplateCluster): Set<string> => {
    const out = new Set<string>();
    for (const u of t.memberUrls ?? []) {
      try {
        out.add(new URL(u).pathname.split('/').filter(Boolean)[0] ?? '(radice)');
      } catch {
        /* URL malformato: non dice nulla sulla sezione */
      }
    }
    return out;
  };

  /**
   * Collasso: un cluster grande che mescola sezioni senza rapporto fra loro.
   * Sotto le quaranta pagine non si blocca: le percentuali sono rumore.
   */
  const sezioniDelPiuGrande = sezioni(mixed[0]);
  if (total >= 40 && largestShare > 0.5 && sezioniDelPiuGrande.size >= 3) {
    return {
      kind: QualityIssue.mixedClusters,
      severity: 'bloccante',
      message:
        `Un solo cluster raccoglie il ${Math.round(largestShare * 100)}% delle pagine ` +
        `(${mixed[0].pageCount} su ${total}) mescolando ${sezioniDelPiuGrande.size} sezioni ` +
        `diverse del sito. Il clustering è collassato: le pagine non vengono più distinte ` +
        `per template, e il campione non rappresenta il sito.`,
      samples: [
        `sezioni nello stesso cluster: ${[...sezioniDelPiuGrande].slice(0, 8).join(', ')}`,
        ...mixed.slice(0, 2).map((t) => `${t.label}: ${t.pageCount} pagine`),
      ],
    };
  }

  if (share < 0.5) return null;

  /**
   * Se ogni cluster misto appartiene a una sezione sola, non c'e' niente di
   * anomalo: e' un sito editoriale, e il messaggio esiste solo per spiegare
   * perche' la scansione e' piu' lunga. Scende a nota, cosi' l'interfaccia puo'
   * tenerlo fuori dalla vista di chi conduce l'audit senza nasconderlo a chi
   * mantiene lo strumento. Un designer che legge "attenzione" si ferma, e si
   * ferma per niente.
   */
  const tutteCoerenti = mixed.every((t) => sezioni(t).size <= 1);

  const extraSamples = mixed.reduce((n, t) => n + t.samples.length, 0);
  return {
    kind: QualityIssue.mixedClusters,
    severity: tutteCoerenti ? 'nota' : 'attenzione',
    message:
      `Il ${Math.round(share * 100)}% delle pagine (${mixedPages} su ${total}) sta in cluster ` +
      `a struttura non uniforme, su ${mixed.length} pattern di URL distinti` +
      (tutteCoerenti
        ? `, ciascuno dentro una sola sezione del sito. È il caso normale di un sito ` +
          `editoriale, dove il corpo degli articoli varia da uno all'altro: il campionamento ` +
          `resta valido e non c'è nulla da correggere. L'unico effetto è che questi cluster ` +
          `vengono sondati più a fondo (${extraSamples} pagine invece del minimo).`
        : `. Il campionamento resta valido; il costo è che questi cluster vengono campionati ` +
          `più fitto (${extraSamples} pagine sondate). Si riduce dichiarando i pattern in ` +
          `configurazione o unificando le versioni linguistiche.`),
    samples: mixed.slice(0, 5).map((t) => `${t.label}: ${t.pageCount} pagine`),
  };
}

/** Pagine escluse perche' il banner non si chiudeva, o non raggiungibili. */
function checkPollutedPages(run: ScanRun): QualityFinding | null {
  const scanned = run.stats.pagesScanned;
  const expected = run.templates.reduce((n, t) => n + t.samples.length, 0);
  if (expected === 0 || scanned >= expected) return null;
  const lost = expected - scanned;
  if (lost / expected < 0.1) return null;

  return {
    kind: QualityIssue.pollutedPages,
    severity: lost / expected > 0.4 ? 'bloccante' : 'attenzione',
    message:
      `${lost} pagine su ${expected} previste non sono state analizzate (pagine di errore, ` +
      `banner non chiudibili o timeout). La copertura dichiarata nel rapporto va corretta ` +
      `di conseguenza.`,
    samples: [],
  };
}

/** Testi rimasti in inglese o segnaposto non risolti nei documenti al cliente. */
function checkTexts(findings: Finding[]): QualityFinding | null {
  const bad = findings.filter(
    (f) =>
      /undefined|NaN|\[object Object\]/.test(f.description + f.title) ||
      /^(Ensure|Elements|Documents|Users|Links|Form|Frames|Images)\b/.test(f.title),
  );
  if (bad.length === 0) return null;

  return {
    kind: QualityIssue.untranslatedText,
    severity: 'attenzione',
    message:
      `${bad.length} finding hanno testi non pronti per il cliente: rimasti in inglese, ` +
      `oppure con segnaposto non risolti. Vanno aggiunti al catalogo italiano ` +
      `(src/analyze/axeRules.it.ts).`,
    samples: bad.slice(0, 6).map((f) => f.title.slice(0, 70)),
  };
}

/* ------------------------------------------------------------------ *
 * Composizione
 * ------------------------------------------------------------------ */

export function selfCheck(run: ScanRun): QualityReport {
  const issues = [
    checkDuplicates(run),
    checkSignatureStability(run.findings),
    checkMixedClusters(run.templates),
    checkPollutedPages(run),
    checkFragmentation(run.findings, run.evidence),
    checkTexts(run.findings),
  ].filter((x): x is QualityFinding => x !== null);

  return {
    issues,
    trustworthy: !issues.some((i) => i.severity === 'bloccante'),
  };
}

/** Resa testuale per il terminale. */
export function formatQuality(report: QualityReport): string {
  if (report.issues.length === 0) {
    return '  Nessuna anomalia rilevata nell\'analisi.';
  }
  const lines: string[] = [];
  for (const issue of report.issues) {
    const tag =
      issue.severity === 'bloccante'
        ? 'BLOCCANTE'
        : issue.severity === 'attenzione'
          ? 'ATTENZIONE'
          : 'NOTA';
    lines.push(`  [${tag}] ${issue.message}`);
    for (const s of issue.samples) lines.push(`      · ${s}`);
  }
  if (!report.trustworthy) {
    lines.push('');
    lines.push(
      '  I risultati NON sono pronti per il cliente: correggere i problemi bloccanti ' +
        'prima di costruire il documento di restituzione.',
    );
  }
  return lines.join('\n');
}
