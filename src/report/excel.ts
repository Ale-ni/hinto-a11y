/**
 * Backlog Excel prioritizzato.
 *
 * E' il deliverable operativo: il foglio su cui i team di UniVR lavorano e
 * che finisce agli atti. Deve reggere tre usi diversi senza rimaneggiamenti:
 * pianificazione (ordinato per priorita'), tracciabilita' (ogni voce risale
 * alle evidenze grezze) e rendicontazione (copertura per criterio, nella forma
 * che serve alla Dichiarazione di Accessibilita').
 */
import ExcelJS from 'exceljs';
import type { ScanRun } from '../core/types.js';
import { WCAG21_AA, getCriterion, isBaseline } from '../core/wcag.js';

const BAND_FILL: Record<string, string> = {
  critica: 'FFF4D6D6',
  alta: 'FFFBE4D8',
  media: 'FFFDF2D0',
  bassa: 'FFF0F0EE',
};

const HEADER_FILL = 'FF2A2A28';

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
  row.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  row.height = 26;
}

export async function renderExcel(run: ScanRun, outPath: string): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Hinto A11y Engine';
  wb.created = new Date(run.startedAt);

  const siteById = new Map(run.sites.map((s) => [s.id, s]));
  const templateByFp = new Map(run.templates.map((t) => [t.fingerprint, t]));
  const evidenceById = new Map(run.evidence.map((e) => [e.id, e]));

  /* ---------------------------------------------------------------- *
   * 1. Sintesi
   * ---------------------------------------------------------------- */
  const s1 = wb.addWorksheet('Sintesi', {
    properties: { defaultColWidth: 22 },
    views: [{ showGridLines: false }],
  });
  s1.columns = [{ width: 34 }, { width: 22 }, { width: 60 }];

  s1.addRow(['Audit di accessibilità digitale']).font = { bold: true, size: 16 };
  s1.addRow([run.project]).font = { size: 13, color: { argb: 'FF52514E' } };
  s1.addRow([]);

  const meta: Array<[string, string | number, string]> = [
    ['Standard di riferimento', run.standard, 'Baseline normativa vincolante via EN 301 549'],
    ['Data della scansione', new Date(run.startedAt).toLocaleDateString('it-IT'), ''],
    ['Motore deterministico', `axe-core ${run.axeVersion}`, 'Licenza MPL-2.0'],
    ['Siti analizzati', run.sites.length, run.sites.map((s) => s.label).join(', ')],
    ['Pagine scoperte', run.stats.pagesDiscovered, "Totale URL individuate nell'ecosistema"],
    ['Template distinti', run.templates.length, 'Unità di analisi effettiva'],
    ['Pagine scansionate', run.stats.pagesScanned, 'Campione rappresentativo dei template'],
    ['Evidenze raccolte', run.stats.evidenceCollected, 'Osservazioni grezze prima della deduplica'],
    ['Problemi distinti', run.findings.length, 'Dopo raggruppamento per componente'],
    ['Fattore di compressione', `${run.stats.dedupeRatio}×`, 'Evidenze grezze per singolo problema'],
  ];
  for (const [k, v, note] of meta) {
    const r = s1.addRow([k, v, note]);
    r.getCell(1).font = { bold: true };
    r.getCell(3).font = { color: { argb: 'FF6D6B66' }, size: 10 };
  }

  s1.addRow([]);
  s1.addRow(['Distribuzione per severità']).font = { bold: true, size: 13 };
  const bandRow = s1.addRow(['Fascia', 'Problemi', 'Significato']);
  styleHeader(bandRow);
  const bandNotes: Record<string, string> = {
    critica: 'Blocca completamente alcune categorie di utenti, o alta esposizione normativa diffusa',
    alta: 'Ostacolo grave, oppure difetto diffuso su tutto l’ecosistema',
    media: 'Impatto circoscritto o su un numero limitato di pagine',
    bassa: 'Rifinitura: da correggere ma senza urgenza',
  };
  for (const band of ['critica', 'alta', 'media', 'bassa'] as const) {
    const n = run.findings.filter((f) => f.severity.band === band).length;
    const r = s1.addRow([band.charAt(0).toUpperCase() + band.slice(1), n, bandNotes[band]]);
    r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND_FILL[band] } };
    r.getCell(3).font = { size: 10, color: { argb: 'FF6D6B66' } };
  }

  s1.addRow([]);
  const verdictHeader = s1.addRow(['Esito', 'Problemi', 'Significato']);
  styleHeader(verdictHeader);
  s1.addRow([
    'Non conforme',
    run.findings.filter((f) => f.verdict === 'fail').length,
    'Fallimento dimostrabile in modo deterministico',
  ]);
  s1.addRow([
    'Da verificare',
    run.findings.filter((f) => f.verdict === 'needs-review').length,
    'Il criterio richiede giudizio umano: serve conferma di un revisore',
  ]);

  s1.addRow([]);
  const disclaimer = s1.addRow([
    'Avvertenza',
    '',
    'La copertura automatica dei criteri WCAG si attesta intorno al 30-57%. Questo documento non sostituisce la verifica con tecnologie assistive né la validazione di un esperto, e non costituisce di per sé dichiarazione di conformità.',
  ]);
  disclaimer.getCell(1).font = { bold: true };
  disclaimer.getCell(3).alignment = { wrapText: true, vertical: 'top' };
  disclaimer.height = 46;

  /* ---------------------------------------------------------------- *
   * 2. Backlog
   * ---------------------------------------------------------------- */
  const s2 = wb.addWorksheet('Backlog', { views: [{ state: 'frozen', ySplit: 1 }] });
  s2.columns = [
    { header: 'Priorità', key: 'prio', width: 9 },
    { header: 'ID', key: 'id', width: 14 },
    { header: 'Problema', key: 'title', width: 46 },
    { header: 'Esito', key: 'verdict', width: 15 },
    { header: 'Severità', key: 'band', width: 11 },
    { header: 'Punteggio', key: 'score', width: 11 },
    { header: 'Criteri WCAG', key: 'criteria', width: 16 },
    { header: 'Livello', key: 'level', width: 9 },
    { header: 'Componente', key: 'component', width: 34 },
    { header: 'Siti', key: 'sites', width: 26 },
    { header: 'Occorrenze stimate', key: 'occ', width: 16 },
    { header: 'Pagine osservate', key: 'pages', width: 14 },
    { header: 'Competenza', key: 'owner', width: 13 },
    { header: 'Impegno', key: 'effort', width: 10 },
    { header: 'Cosa succede', key: 'description', width: 70 },
    { header: 'Come si corregge', key: 'remediation', width: 70 },
    { header: 'Esempio di codice', key: 'code', width: 50 },
    { header: 'Fiducia', key: 'confidence', width: 9 },
    { header: 'URL di esempio', key: 'sample', width: 54 },
    { header: 'Stato', key: 'status', width: 14 },
    { header: 'Note interne', key: 'notes', width: 34 },
  ];
  styleHeader(s2.getRow(1));

  run.findings.forEach((f, i) => {
    const levels = [
      ...new Set(f.criteria.map((c) => getCriterion(c)?.level).filter(Boolean)),
    ].join('/');
    const firstEvidence = f.evidenceIds.map((id) => evidenceById.get(id)).find(Boolean);

    const row = s2.addRow({
      prio: i + 1,
      id: f.id,
      title: f.title,
      verdict: f.verdict === 'fail' ? 'Non conforme' : 'Da verificare',
      band: f.severity.band.charAt(0).toUpperCase() + f.severity.band.slice(1),
      score: f.severity.score,
      criteria: f.criteria.join(', '),
      level: levels || '—',
      component: f.component,
      sites: f.siteIds.map((s) => siteById.get(s)?.label ?? s).join(', '),
      occ: f.occurrenceCount,
      pages: f.pageCount,
      owner: f.owner,
      effort: f.effort,
      description: f.description,
      remediation: f.remediation,
      code: f.codeExample ?? '',
      confidence: Math.round(f.confidence * 100) / 100,
      sample: firstEvidence?.pageUrl ?? '',
      status: 'Da fare',
      notes: '',
    });

    row.alignment = { vertical: 'top', wrapText: true };
    row.getCell('band').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: BAND_FILL[f.severity.band] },
    };
    if (f.verdict === 'needs-review') {
      row.getCell('verdict').font = { color: { argb: 'FF8A6200' }, bold: true };
    } else {
      row.getCell('verdict').font = { color: { argb: 'FFB02A2A' }, bold: true };
    }
    if (firstEvidence?.pageUrl) {
      row.getCell('sample').value = {
        text: firstEvidence.pageUrl,
        hyperlink: firstEvidence.pageUrl,
      };
      row.getCell('sample').font = { color: { argb: 'FF184F95' }, underline: true };
    }
  });

  s2.autoFilter = { from: 'A1', to: { row: 1, column: s2.columns.length } };

  // menu a tendina sulla colonna di stato: il foglio diventa strumento di lavoro
  const statusCol = s2.getColumn('status').letter;
  for (let r = 2; r <= run.findings.length + 1; r++) {
    s2.getCell(`${statusCol}${r}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"Da fare,In corso,Fatto,Non applicabile,Rinviato"'],
    };
  }

  /* ---------------------------------------------------------------- *
   * 3. Evidenze
   * ---------------------------------------------------------------- */
  const s3 = wb.addWorksheet('Evidenze', { views: [{ state: 'frozen', ySplit: 1 }] });
  s3.columns = [
    { header: 'ID evidenza', key: 'id', width: 18 },
    { header: 'Sito', key: 'site', width: 24 },
    { header: 'URL', key: 'url', width: 58 },
    { header: 'Check', key: 'check', width: 30 },
    { header: 'Criteri', key: 'criteria', width: 14 },
    { header: 'Componente', key: 'component', width: 34 },
    { header: 'Selettore', key: 'selector', width: 40 },
    { header: 'Osservazione', key: 'observation', width: 76 },
    { header: 'Gravità motore', key: 'impact', width: 13 },
  ];
  styleHeader(s3.getRow(1));

  for (const e of run.evidence) {
    const row = s3.addRow({
      id: e.id,
      site: siteById.get(e.siteId)?.label ?? e.siteId,
      url: e.pageUrl,
      check: e.checkId,
      criteria: e.criteria.join(', '),
      component: e.componentSignature,
      selector: e.selector,
      observation: e.observation,
      impact: e.engineImpact ?? '',
    });
    row.alignment = { vertical: 'top', wrapText: true };
  }
  s3.autoFilter = { from: 'A1', to: { row: 1, column: s3.columns.length } };

  /* ---------------------------------------------------------------- *
   * 4. Template e campionamento
   * ---------------------------------------------------------------- */
  const s4 = wb.addWorksheet('Template', { views: [{ state: 'frozen', ySplit: 1 }] });
  s4.columns = [
    { header: 'Template', key: 'label', width: 32 },
    { header: 'Firma', key: 'fp', width: 15 },
    { header: 'Siti', key: 'sites', width: 30 },
    { header: 'Pagine nel cluster', key: 'pages', width: 17 },
    { header: 'Pagine scansionate', key: 'samples', width: 17 },
    { header: 'URL campionate', key: 'urls', width: 80 },
  ];
  styleHeader(s4.getRow(1));
  for (const t of run.templates) {
    const row = s4.addRow({
      label: t.label,
      fp: t.fingerprint,
      sites: t.siteIds.map((s) => siteById.get(s)?.label ?? s).join(', '),
      pages: t.pageCount,
      samples: t.samples.length,
      urls: t.samples.join('\n'),
    });
    row.alignment = { vertical: 'top', wrapText: true };
  }
  s4.autoFilter = { from: 'A1', to: { row: 1, column: s4.columns.length } };

  /* ---------------------------------------------------------------- *
   * 5. Copertura per criterio WCAG
   * ---------------------------------------------------------------- */
  const s5 = wb.addWorksheet('Copertura WCAG', { views: [{ state: 'frozen', ySplit: 1 }] });
  s5.columns = [
    { header: 'Criterio', key: 'id', width: 10 },
    { header: 'Titolo', key: 'title', width: 42 },
    { header: 'Livello', key: 'level', width: 8 },
    { header: 'Principio', key: 'principle', width: 15 },
    { header: 'Automatizzabile', key: 'automation', width: 16 },
    { header: 'Problemi rilevati', key: 'hits', width: 15 },
    { header: 'Di cui certi', key: 'fails', width: 12 },
    { header: 'Di cui da verificare', key: 'reviews', width: 17 },
    { header: 'Esito preliminare', key: 'outcome', width: 22 },
    { header: 'In che consiste', key: 'plain', width: 78 },
  ];
  styleHeader(s5.getRow(1));

  const AUTOMATION_LABEL: Record<string, string> = {
    deterministic: 'Sì, in automatico',
    partial: 'Parziale',
    judgment: 'No, solo verifica umana',
  };

  for (const crit of WCAG21_AA) {
    const hits = run.findings.filter((f) => f.criteria.includes(crit.id));
    const fails = hits.filter((f) => f.verdict === 'fail').length;
    const reviews = hits.filter((f) => f.verdict === 'needs-review').length;

    let outcome: string;
    if (fails > 0) outcome = 'Non conforme';
    else if (reviews > 0) outcome = 'Da verificare';
    else if (crit.automation === 'deterministic') outcome = 'Nessun problema rilevato';
    else outcome = 'Non verificato in automatico';

    const row = s5.addRow({
      id: crit.id,
      title: crit.title,
      level: crit.level,
      principle: crit.principle,
      automation: AUTOMATION_LABEL[crit.automation],
      hits: hits.length,
      fails,
      reviews,
      outcome,
      plain: crit.plainLanguage,
    });
    row.alignment = { vertical: 'top', wrapText: true };
    if (fails > 0) {
      row.getCell('outcome').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: BAND_FILL.critica },
      };
    } else if (reviews > 0 || crit.automation !== 'deterministic') {
      row.getCell('outcome').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: BAND_FILL.media },
      };
    }
  }
  s5.autoFilter = { from: 'A1', to: { row: 1, column: s5.columns.length } };

  // nota metodologica in coda: evita che "nessun problema rilevato" venga
  // letto come "conforme", che e' l'equivoco piu' costoso in questi documenti
  s5.addRow([]);
  const note = s5.addRow([
    '',
    'Nota: "Nessun problema rilevato" non equivale a conformità. Vale solo per i criteri interamente verificabili in automatico e limitatamente alle pagine campionate. I criteri marcati "No, solo verifica umana" richiedono test con tecnologie assistive e non sono stati valutati da questo strumento.',
  ]);
  note.getCell(2).alignment = { wrapText: true, vertical: 'top' };
  note.getCell(2).font = { italic: true, color: { argb: 'FF6D6B66' } };
  note.height = 42;

  await wb.xlsx.writeFile(outPath);
}
