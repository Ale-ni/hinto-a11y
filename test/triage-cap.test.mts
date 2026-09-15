/**
 * Verifica il vincolo non negoziabile: il layer AI puo' DECLASSARE un verdetto
 * ma non puo' mai PROMUOVERLO oltre il tetto stabilito dalla natura del
 * criterio WCAG. Il controllo deve vivere nel codice, non solo nel prompt:
 * un prompt si puo' modificare per sbaglio, un modello puo' sbagliare.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyTriage, type TriageResult } from '../src/analyze/aiPort.js';
import type { Finding } from '../src/core/types.js';

const run = JSON.parse(readFileSync('out/run.json', 'utf8'));
const findings: Finding[] = run.findings;

// un finding su criterio di giudizio (1.1.1 e' "partial" -> tetto needs-review)
const judgment = findings.find((f) => f.criteria.includes('1.1.1') && f.verdict === 'needs-review');
// un finding su criterio deterministico (2.4.7 -> tetto fail)
const deterministic = findings.find((f) => f.criteria.includes('2.4.7') && f.verdict === 'fail');

assert.ok(judgment, 'serve un finding su criterio di giudizio');
assert.ok(deterministic, 'serve un finding su criterio deterministico');

const malicious: TriageResult[] = [
  {
    schemaVersion: '1.0',
    packId: 'pack-test',
    findings: [
      {
        // il modello tenta di promuovere un criterio di giudizio a non conformita'
        id: judgment.id,
        verdict: 'fail',
        confidence: 0.99,
        title: 'Titolo riscritto dal modello',
        description: 'Descrizione riscritta.',
        remediation: 'Remediation riscritta.',
        owner: 'contenuti',
        effort: 'medio',
        rationale: 'tentativo di promozione',
      },
      {
        // declassamento legittimo su criterio deterministico
        id: deterministic.id,
        verdict: 'needs-review',
        confidence: 0.5,
        title: 'Declassato dal modello',
        description: 'Le evidenze non convincono.',
        remediation: 'Da verificare a mano.',
        owner: 'frontend',
        effort: 'basso',
        rationale: 'declassamento legittimo',
        reviewQuestion: 'Il focus e davvero invisibile su questo componente?',
      },
    ],
  },
];

const { findings: merged, applied, rejected } = applyTriage(findings, malicious);

const j = merged.find((f) => f.id === judgment.id)!;
const d = merged.find((f) => f.id === deterministic.id)!;

console.log('applicati:', applied, '| rifiutati:', rejected.length);

assert.equal(j.verdict, 'needs-review', 'PROMOZIONE NON BLOCCATA: il tetto del criterio e stato violato');
assert.equal(j.title, 'Titolo riscritto dal modello', 'i testi del modello devono essere applicati');
assert.equal(rejected.length, 1, 'la promozione deve essere registrata come rifiutata');
assert.match(rejected[0], /non e' deterministico/, 'il motivo del rifiuto deve essere esplicito');

assert.equal(d.verdict, 'needs-review', 'il declassamento legittimo deve passare');
assert.equal(d.aiGenerated, true, 'il finding deve risultare arricchito dal modello');

console.log('OK  promozione bloccata:', rejected[0]);
console.log('OK  declassamento accettato, testi del modello applicati');
console.log('\nTutti i controlli superati.');
