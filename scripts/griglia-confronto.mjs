#!/usr/bin/env node
/**
 * Griglia di confronto per la validazione umana.
 *
 * Serve a rispondere alla sola domanda che decide se questo motore ha un
 * futuro: quello che produce regge il confronto con il lavoro di un designer
 * che fa lo stesso audit a mano?
 *
 * La risposta e' credibile solo se l'ordine e' quello giusto. Se il designer
 * legge prima il backlog del motore e poi guarda il sito, non sta facendo un
 * confronto: sta verificando una lista, e trovera' quasi solo cio' che c'e'
 * scritto. L'informazione piu' preziosa - cosa il motore NON vede - andrebbe
 * persa per intero.
 *
 * Quindi il foglio e' costruito in due tempi:
 *   1. il designer audita il sito con il suo metodo e scrive cosa trova;
 *   2. solo dopo apre il confronto e giudica riga per riga.
 *
 * Le colonne di giudizio sono vuote apposta: le riempie lui, non il motore.
 *
 * Uso:  node scripts/griglia-confronto.mjs <run.json> <output.xlsx>
 */
import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';

const [, , runPath, outPath = 'griglia-confronto.xlsx'] = process.argv;
if (!runPath) {
  console.error('uso: node scripts/griglia-confronto.mjs <run.json> [output.xlsx]');
  process.exit(1);
}

const FONT = 'Arial';
const INK = {
  testo: 'FF1A1A1A',
  tenue: 'FF6B6B6B',
  linea: 'FFD8D8D8',
  intestazione: 'FF1F2933',
  daRiempire: 'FFFFF6D6',
  sezione: 'FFF2F4F6',
};
const BANDA = {
  critica: 'FFB3261E',
  alta: 'FFD97706',
  media: 'FF2563EB',
  bassa: 'FF6B7280',
};

const run = JSON.parse(await readFile(runPath, 'utf8'));
const evidenceById = new Map(run.evidence.map((e) => [e.id, e]));

/** Righe ordinate per gravita': si giudica prima cio' che pesa di piu'. */
const rows = run.findings
  .map((f) => {
    const ev = f.evidenceIds.map((id) => evidenceById.get(id)).filter(Boolean);
    const pages = [...new Set(ev.map((e) => e.pageUrl).filter(Boolean))];
    return {
      titolo: f.title,
      cosa: f.description,
      componente: f.component,
      criteri: (f.criteria ?? []).join(', '),
      banda: f.severity?.band ?? '',
      punteggio: f.severity?.score ?? 0,
      verdetto: f.verdict,
      occorrenze: f.occurrenceCount,
      pagine: pages.length,
      esempio: pages[0] ?? '',
      responsabile: f.owner,
      fiducia: Math.round((f.confidence ?? 0) * 100),
    };
  })
  .sort((a, b) => b.punteggio - a.punteggio);

const wb = new ExcelJS.Workbook();
wb.creator = 'Hinto a11y engine';
wb.created = new Date();

/* ================================================================== *
 * Foglio 0 — Istruzioni
 * ================================================================== */

const istr = wb.addWorksheet('Istruzioni', {
  properties: { defaultRowHeight: 18 },
  pageSetup: { paperSize: 9, orientation: 'portrait' },
});
istr.columns = [{ width: 4 }, { width: 104 }];

const blocchi = [
  ['titolo', 'Confronto fra analisi automatica e analisi manuale'],
  [
    'p',
    `Progetto: ${run.project} · motore versione ${run.engineVersion} · ${run.standard}`,
  ],
  [
    'p',
    `Campione analizzato dal motore: ${run.stats.pagesScanned} pagine su ${run.stats.pagesDiscovered} scoperte, ` +
      `raggruppate in ${run.templates.length} template. Problemi distinti prodotti: ${rows.length}.`,
  ],
  ['spazio', ''],
  ['h', 'A cosa serve'],
  [
    'p',
    'A capire se il motore produce un audit utilizzabile, e dove sbaglia. Non serve a valutare ' +
      'il sito e non serve a valutare te: serve a misurare lo strumento. Un tuo "falso positivo" ' +
      'vale quanto una conferma, e un problema che trovi tu e il motore no vale molto di piu\' ' +
      'di entrambi.',
  ],
  ['spazio', ''],
  ['h', 'L\'ordine conta, ed e\' la parte piu\' importante'],
  [
    'p',
    'Il foglio "1 · La tua analisi" va compilato PRIMA di aprire il foglio "2 · Confronto". ' +
      'Non e\' una formalita\': chi legge prima l\'elenco del motore poi cerca conferme a quell\'elenco, ' +
      'e i problemi che il motore non vede diventano invisibili anche a chi verifica. ' +
      'Quei problemi sono il dato che ci serve di piu\'.',
  ],
  ['spazio', ''],
  ['h', 'Come procedere'],
  [
    'li',
    '1. Apri il foglio "1 · La tua analisi". Segna l\'ora di inizio.',
  ],
  [
    'li',
    '2. Audita il sito con il tuo metodo abituale, negli strumenti che usi di solito. ' +
      'Stesso perimetro del motore: www.hintogroup.eu, italiano e inglese.',
  ],
  [
    'li',
    '3. Scrivi nel foglio 1 ogni problema che trovi, una riga per problema. ' +
      'Non serve precisione formale sui criteri WCAG: conta che il problema sia identificabile.',
  ],
  ['li', '4. Segna l\'ora di fine. Il tempo impiegato e\' un dato, non un giudizio.'],
  [
    'li',
    '5. Solo ora apri "2 · Confronto" e giudica riga per riga. Le colonne gialle sono le tue.',
  ],
  [
    'li',
    '6. Il foglio "3 · Esito" si compila da solo: guardalo alla fine.',
  ],
  ['spazio', ''],
  ['h', 'Cosa significano i verdetti'],
  [
    'li',
    'Confermato — il problema c\'e\', ed e\' descritto in modo corretto.',
  ],
  [
    'li',
    'Falso positivo — il problema non esiste, oppure la descrizione e\' sbagliata al punto da ' +
      'rendere la segnalazione inutilizzabile.',
  ],
  [
    'li',
    'Irrilevante nel contesto — tecnicamente vero, ma non lo metteresti in un rapporto al cliente. ' +
      'Dire perche\' nelle note e\' prezioso: e\' la differenza fra un motore preciso e uno utile.',
  ],
  [
    'li',
    'Severita\' diversa — il problema c\'e\' ma il motore lo pesa male. Indica la tua nella colonna accanto.',
  ],
  [
    'li',
    'Da approfondire — non decidibile senza provare con tecnologia assistiva o senza vedere il codice.',
  ],
  ['spazio', ''],
  ['h', 'Due cose che il motore dichiara gia\' di non saper fare'],
  [
    'p',
    'Non giudica se un testo alternativo e\' ADEGUATO, solo se c\'e\'. Non prova il sito con uno ' +
      'screen reader. Se il tuo audit copre queste due cose, segnalalo: e\' esattamente il confine ' +
      'fra cio\' che va automatizzato e cio\' che resta umano, ed e\' quello che stiamo cercando di ' +
      'tracciare.',
  ],
];

let riga = 2;
for (const [tipo, testo] of blocchi) {
  const c = istr.getCell(`B${riga}`);
  if (tipo === 'spazio') {
    riga += 1;
    continue;
  }
  c.value = testo;
  c.alignment = { wrapText: true, vertical: 'top' };
  if (tipo === 'titolo') {
    c.font = { name: FONT, size: 16, bold: true, color: { argb: INK.intestazione } };
    istr.getRow(riga).height = 26;
  } else if (tipo === 'h') {
    c.font = { name: FONT, size: 12, bold: true, color: { argb: INK.intestazione } };
    istr.getRow(riga).height = 22;
  } else {
    c.font = { name: FONT, size: 10.5, color: { argb: INK.testo } };
    istr.getRow(riga).height = Math.max(18, Math.ceil(testo.length / 95) * 15 + 4);
  }
  riga += 1;
}

/* ================================================================== *
 * Foglio 1 — L'analisi del designer, in cieco
 * ================================================================== */

const mia = wb.addWorksheet('1 · La tua analisi', { views: [{ state: 'frozen', ySplit: 6 }] });
mia.columns = [
  { header: '#', key: 'n', width: 5 },
  { header: 'Pagina o sezione', key: 'dove', width: 34 },
  { header: 'Componente / elemento', key: 'cosa', width: 30 },
  { header: 'Problema riscontrato', key: 'problema', width: 56 },
  { header: 'Criterio WCAG (se lo sai)', key: 'criterio', width: 20 },
  { header: 'Gravità secondo te', key: 'gravita', width: 18 },
  { header: 'Come lo hai trovato', key: 'metodo', width: 26 },
];

mia.mergeCells('A1:G1');
mia.getCell('A1').value = '1 · La tua analisi — da compilare PRIMA di aprire il foglio 2';
mia.getCell('A1').font = { name: FONT, size: 13, bold: true, color: { argb: INK.intestazione } };
mia.getRow(1).height = 24;

mia.getCell('A2').value = 'Ora di inizio';
mia.getCell('B2').value = '';
mia.getCell('D2').value = 'Ora di fine';
mia.getCell('E2').value = '';
mia.getCell('A3').value = 'Strumenti usati';
mia.mergeCells('B3:G3');
mia.getCell('B3').value = '';
mia.getCell('A4').value = 'Perimetro coperto';
mia.mergeCells('B4:G4');
mia.getCell('B4').value = '';
for (const ref of ['A2', 'D2', 'A3', 'A4']) {
  mia.getCell(ref).font = { name: FONT, size: 10, bold: true, color: { argb: INK.tenue } };
}
for (const ref of ['B2', 'E2', 'B3', 'B4']) {
  mia.getCell(ref).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK.daRiempire } };
  mia.getCell(ref).border = { bottom: { style: 'thin', color: { argb: INK.linea } } };
}

const intestazioneMia = mia.getRow(6);
['#', 'Pagina o sezione', 'Componente / elemento', 'Problema riscontrato', 'Criterio WCAG (se lo sai)', 'Gravità secondo te', 'Come lo hai trovato'].forEach(
  (h, i) => {
    const c = intestazioneMia.getCell(i + 1);
    c.value = h;
    c.font = { name: FONT, size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK.intestazione } };
    c.alignment = { wrapText: true, vertical: 'middle' };
  },
);
intestazioneMia.height = 30;

/** Riga d'esempio: mostra il formato atteso senza suggerire dove guardare. */
const esempio = mia.getRow(7);
esempio.values = [
  'es.',
  '/it/contatti',
  'modulo di contatto, campo "Oggetto"',
  'Il campo non ha etichetta visibile: il segnaposto sparisce appena si digita.',
  '3.3.2',
  'Alta',
  'Tastiera + ispezione',
];
esempio.eachCell((c) => {
  c.font = { name: FONT, size: 9.5, italic: true, color: { argb: INK.tenue } };
  c.alignment = { wrapText: true, vertical: 'top' };
});
esempio.height = 30;

for (let i = 0; i < 60; i++) {
  const r = mia.getRow(8 + i);
  r.getCell(1).value = i + 1;
  r.getCell(1).font = { name: FONT, size: 10, color: { argb: INK.tenue } };
  for (let col = 2; col <= 7; col++) {
    const c = r.getCell(col);
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK.daRiempire } };
    c.font = { name: FONT, size: 10, color: { argb: INK.testo } };
    c.alignment = { wrapText: true, vertical: 'top' };
    c.border = { bottom: { style: 'hair', color: { argb: INK.linea } } };
  }
  r.getCell(6).dataValidation = {
    type: 'list',
    allowBlank: true,
    formulae: ['"Critica,Alta,Media,Bassa"'],
  };
  r.height = 22;
}

/* ================================================================== *
 * Foglio 2 — Il confronto
 * ================================================================== */

const conf = wb.addWorksheet('2 · Confronto', { views: [{ state: 'frozen', xSplit: 2, ySplit: 4 }] });

const COLONNE = [
  { h: '#', w: 5 },
  { h: 'Problema', w: 36 },
  { h: 'Cosa succede', w: 58 },
  { h: 'Criteri', w: 11 },
  { h: 'Gravità\nmotore', w: 10 },
  { h: 'Punt.', w: 7 },
  { h: 'Occorrenze\nstimate', w: 12 },
  { h: 'Pagine', w: 8 },
  { h: 'Componente', w: 40 },
  { h: 'Pagina di esempio', w: 42 },
  { h: 'Responsabile', w: 14 },
  { h: 'IL TUO VERDETTO', w: 22 },
  { h: 'Gravità\nsecondo te', w: 13 },
  { h: "L'avevi già trovato\nnel foglio 1?", w: 16 },
  { h: 'Note', w: 46 },
];
conf.columns = COLONNE.map((c) => ({ width: c.w }));

conf.mergeCells('A1:O1');
conf.getCell('A1').value = '2 · Confronto — apri solo dopo aver compilato il foglio 1';
conf.getCell('A1').font = { name: FONT, size: 13, bold: true, color: { argb: INK.intestazione } };
conf.getRow(1).height = 24;

conf.mergeCells('A2:O2');
conf.getCell('A2').value =
  'Le colonne gialle sono tue. Le altre sono l\'output del motore, riportato senza modifiche. ' +
  'Righe ordinate per gravità decrescente: se il tempo finisce, le prime sono quelle che contano.';
conf.getCell('A2').font = { name: FONT, size: 10, color: { argb: INK.tenue } };
conf.getCell('A2').alignment = { wrapText: true, vertical: 'top' };
conf.getRow(2).height = 28;

const intestazione = conf.getRow(4);
COLONNE.forEach((col, i) => {
  const c = intestazione.getCell(i + 1);
  c.value = col.h;
  c.font = { name: FONT, size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
  c.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: i >= 11 && i <= 14 ? 'FF8A6D00' : INK.intestazione },
  };
  c.alignment = { wrapText: true, vertical: 'middle', horizontal: 'left' };
});
intestazione.height = 34;

rows.forEach((x, i) => {
  const r = conf.getRow(5 + i);
  r.values = [
    i + 1,
    x.titolo,
    x.cosa,
    x.criteri,
    x.banda,
    x.punteggio,
    x.occorrenze,
    x.pagine,
    x.componente,
    x.esempio,
    x.responsabile,
    '',
    '',
    '',
    '',
  ];
  r.eachCell({ includeEmpty: true }, (c, n) => {
    c.font = { name: FONT, size: 9.5, color: { argb: INK.testo } };
    c.alignment = { wrapText: true, vertical: 'top' };
    c.border = { bottom: { style: 'hair', color: { argb: INK.linea } } };
    if (n >= 12 && n <= 15) {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK.daRiempire } };
    }
  });
  r.getCell(5).font = {
    name: FONT,
    size: 9.5,
    bold: true,
    color: { argb: BANDA[x.banda] ?? INK.testo },
  };
  r.getCell(10).value = { text: x.esempio, hyperlink: x.esempio };
  r.getCell(10).font = { name: FONT, size: 9, color: { argb: 'FF2563EB' }, underline: true };

  r.getCell(12).dataValidation = {
    type: 'list',
    allowBlank: true,
    formulae: [
      '"Confermato,Falso positivo,Irrilevante nel contesto,Severità diversa,Da approfondire"',
    ],
  };
  r.getCell(13).dataValidation = {
    type: 'list',
    allowBlank: true,
    formulae: ['"Critica,Alta,Media,Bassa"'],
  };
  r.getCell(14).dataValidation = {
    type: 'list',
    allowBlank: true,
    formulae: ['"Sì,No"'],
  };
  r.height = Math.max(30, Math.ceil(x.cosa.length / 62) * 12 + 18);
});

conf.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + rows.length, column: 15 } };

/* ================================================================== *
 * Foglio 3 — Esito, calcolato
 * ================================================================== */

const esito = wb.addWorksheet('3 · Esito');
esito.columns = [{ width: 4 }, { width: 46 }, { width: 14 }, { width: 58 }];

const ultima = 4 + rows.length;
const V = `'2 · Confronto'!$L$5:$L$${ultima}`;
const T = `'2 · Confronto'!$N$5:$N$${ultima}`;
const B = `'2 · Confronto'!$E$5:$E$${ultima}`;

const righeEsito = [
  ['titolo', 'Esito del confronto', '', ''],
  ['nota', 'Si compila da solo man mano che riempi il foglio 2.', '', ''],
  ['spazio'],
  ['h', 'Precisione del motore', '', ''],
  ['dato', 'Problemi prodotti dal motore', `=COUNTA(${V})+COUNTBLANK(${V})`, 'Totale righe da giudicare.'],
  ['dato', 'Giudicati finora', `=COUNTA(${V})`, 'Quante righe hanno un verdetto.'],
  ['dato', 'Confermati', `=COUNTIF(${V},"Confermato")`, 'Il motore aveva ragione e lo ha descritto bene.'],
  ['dato', 'Falsi positivi', `=COUNTIF(${V},"Falso positivo")`, 'Il costo vero: erodono la fiducia nel backlog.'],
  ['dato', 'Irrilevanti nel contesto', `=COUNTIF(${V},"Irrilevante nel contesto")`, 'Veri ma non da mettere in un rapporto. Da leggere nelle note: e\' il margine di miglioramento piu\' facile.'],
  ['dato', 'Severità da correggere', `=COUNTIF(${V},"Severità diversa")`, 'Il problema c\'e\' ma la priorità e\' sbagliata.'],
  ['dato', 'Da approfondire', `=COUNTIF(${V},"Da approfondire")`, 'Non decidibile senza tecnologia assistiva o accesso al codice.'],
  ['calc', 'Tasso di conferma', `=IFERROR(COUNTIF(${V},"Confermato")/COUNTA(${V}),"")`, 'Sopra il 70% il backlog e\' consegnabile con una revisione leggera. Sotto il 50% va rivisto il motore prima di usarlo su un cliente.'],
  ['calc', 'Tasso di falsi positivi', `=IFERROR(COUNTIF(${V},"Falso positivo")/COUNTA(${V}),"")`, 'E\' la soglia piu\' severa: un revisore smette di fidarsi molto prima di quanto si creda.'],
  ['spazio'],
  ['h', 'Copertura: il motore vede quello che vedi tu?', '', ''],
  ['dato', 'Problemi che avevi già trovato', `=COUNTIF(${T},"Sì")`, 'Sovrapposizione fra le due analisi.'],
  ['dato', 'Problemi che il motore ha aggiunto', `=COUNTIF(${T},"No")`, 'Valore aggiunto dell\'automazione.'],
  ['dato', 'Problemi trovati solo da te', '', 'DA CONTARE A MANO: le righe del foglio 1 che non trovi in nessuna riga del foglio 2. Sono il dato piu\' importante di tutto il confronto.'],
  ['spazio'],
  ['h', 'Tempo', '', ''],
  ['dato', 'Tua analisi manuale', '', 'Da "1 · La tua analisi": ora di fine meno ora di inizio.'],
  ['dato', 'Scansione del motore', '', 'Registrato dal comando alla fine dell\'esecuzione.'],
  ['dato', 'Revisione del foglio 2', '', 'Il tempo che serve per giudicare le 75 righe. E\' il costo ricorrente del metodo automatico.'],
  ['spazio'],
  ['h', 'Conclusione', '', ''],
  ['libero', 'Lo useresti su un cliente così com\'è?', '', ''],
  ['libero', 'Che cosa manca perché tu lo usi senza riserve?', '', ''],
];

let re = 2;
for (const [tipo, etichetta, formula, spiega] of righeEsito) {
  if (tipo === 'spazio') {
    re += 1;
    continue;
  }
  const b = esito.getCell(`B${re}`);
  b.value = etichetta;
  b.alignment = { wrapText: true, vertical: 'top' };
  if (tipo === 'titolo') {
    b.font = { name: FONT, size: 15, bold: true, color: { argb: INK.intestazione } };
    esito.getRow(re).height = 26;
  } else if (tipo === 'h') {
    b.font = { name: FONT, size: 11.5, bold: true, color: { argb: INK.intestazione } };
    esito.getCell(`B${re}`).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: INK.sezione },
    };
    esito.getRow(re).height = 22;
  } else if (tipo === 'nota') {
    b.font = { name: FONT, size: 10, italic: true, color: { argb: INK.tenue } };
  } else {
    b.font = { name: FONT, size: 10, color: { argb: INK.testo } };
    const c = esito.getCell(`C${re}`);
    if (formula) c.value = { formula };
    c.font = { name: FONT, size: 10, bold: true, color: { argb: INK.testo } };
    c.alignment = { horizontal: 'center' };
    if (tipo === 'calc') c.numFmt = '0%';
    if (!formula) {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK.daRiempire } };
    }
    const d = esito.getCell(`D${re}`);
    d.value = spiega ?? '';
    d.font = { name: FONT, size: 9.5, color: { argb: INK.tenue } };
    d.alignment = { wrapText: true, vertical: 'top' };
    esito.getRow(re).height = Math.max(20, Math.ceil((spiega ?? '').length / 62) * 12 + 10);
  }
  if (tipo === 'libero') {
    esito.mergeCells(`C${re}:D${re}`);
    const c = esito.getCell(`C${re}`);
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK.daRiempire } };
    c.border = { bottom: { style: 'thin', color: { argb: INK.linea } } };
    esito.getRow(re).height = 34;
  }
  re += 1;
}

/* --- distribuzione per banda, come controllo di taratura --------------- */
esito.getCell(`B${re + 1}`).value = 'Distribuzione delle gravità assegnate dal motore';
esito.getCell(`B${re + 1}`).font = {
  name: FONT,
  size: 11.5,
  bold: true,
  color: { argb: INK.intestazione },
};
let rb = re + 2;
for (const banda of ['critica', 'alta', 'media', 'bassa']) {
  esito.getCell(`B${rb}`).value = banda;
  esito.getCell(`B${rb}`).font = { name: FONT, size: 10, color: { argb: BANDA[banda] } };
  esito.getCell(`C${rb}`).value = { formula: `=COUNTIF(${B},"${banda}")` };
  esito.getCell(`C${rb}`).font = { name: FONT, size: 10, bold: true };
  esito.getCell(`C${rb}`).alignment = { horizontal: 'center' };
  rb += 1;
}
esito.getCell(`D${re + 2}`).value =
  'Se giudichi "Severità diversa" molte volte nella stessa direzione, la taratura del motore va corretta: ' +
  'e\' una correzione che si applica ai dati già raccolti, senza rilanciare la scansione.';
esito.getCell(`D${re + 2}`).font = { name: FONT, size: 9.5, color: { argb: INK.tenue } };
esito.getCell(`D${re + 2}`).alignment = { wrapText: true, vertical: 'top' };

await wb.xlsx.writeFile(outPath);
console.log(`griglia scritta: ${outPath}  (${rows.length} problemi da giudicare)`);
