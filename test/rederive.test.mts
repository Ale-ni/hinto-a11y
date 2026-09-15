/**
 * Proprieta' di andata e ritorno del ricalcolo su scansioni vecchie.
 *
 * `rederiveFromComposed` esiste per non buttare via le scansioni fatte prima
 * della 0.3.0, che non contengono il materiale grezzo. La sua correttezza non
 * si puo' dare per buona a parole: se sbaglia, produce un backlog plausibile e
 * sbagliato, che e' il modo di fallire piu' costoso per questo strumento.
 *
 * Il test ricostruisce la situazione vera su dati veri:
 *   1. prende una scansione 0.3.0, che ha sia il materiale grezzo sia la firma
 *      corretta;
 *   2. ricompone da quel materiale la firma che avrebbe prodotto la 0.2.2
 *      (classi hash ammesse, contenitori anonimi non collassati);
 *   3. applica `rederiveFromComposed` a quella firma vecchia;
 *   4. pretende di riottenere esattamente la firma 0.3.0.
 *
 * Se la proprieta' regge, ricalcolare una scansione vecchia da' lo stesso
 * risultato di rilanciarla. Se non regge, il fallimento e' qui e non nel
 * backlog consegnato al cliente.
 */
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import {
  parseSignatureInput,
  rederiveFromComposed,
  type AncestorNode,
  type SignatureInput,
} from '../src/core/signature.js';
import { looksLikeHashedWord, needsStrongEvidence } from '../src/core/identity.js';

const RUN = process.argv[2] ?? 'out-react/run.json';

/* --- riproduzione fedele della composizione 0.2.2 --------------------- */

function describeLegacy(node: AncestorNode, stable: Set<string>): string {
  const tag = node.tag.toLowerCase();
  if (node.testAttr) return `${tag}[${node.testAttr}]`;
  if (node.id && !node.id.includes(':') && !/^(:|[0-9a-f]{8,})/i.test(node.id))
    return `${tag}#${node.id}`;
  const cls = node.classes.find((c) => stable.has(c));
  if (cls) return `${tag}.${cls}`;
  return tag + (node.role ? `[${node.role}]` : '');
}

/** La 0.2.2: nessun collasso dei contenitori anonimi. */
function composeLegacy(input: SignatureInput, stable: Set<string>): string {
  if (input.vendor) return `terze-parti:${input.vendor}`;
  if (!input.chain.length) return 'unknown';
  const chain = [...input.chain];
  const landmarkNode = chain[chain.length - 1]?.landmark ? chain.pop() : undefined;
  const landmark = landmarkNode ? describeLegacy(landmarkNode, stable) : 'body';
  const parts = chain.map((n) => describeLegacy(n, stable)).reverse();
  return `${landmark} > ${parts.join(' > ')}`;
}

/* --------------------------------------------------------------------- */

const run = JSON.parse(await readFile(RUN, 'utf8'));
const stable: Set<string> = new Set(run.stableClasses ?? []);

const withRaw = run.evidence.filter((e: any) => e.signatureInput);
assert.ok(
  withRaw.length > 0,
  `${RUN} non contiene materiale grezzo: serve una scansione 0.3.0 per questo test`,
);

/**
 * L'insieme permissivo della 0.2.2: le classi che passavano allora sono quelle
 * che passano oggi, piu' quelle scartate dal solo controllo sulle maiuscole
 * interne, che nella 0.2.2 non esisteva.
 */
const permissive = new Set(stable);
for (const e of withRaw) {
  const input = parseSignatureInput(e.signatureInput);
  if (!input) continue;
  for (const node of input.chain) {
    for (const cls of node.classes) {
      if (needsStrongEvidence(cls) && looksLikeHashedWord(cls)) permissive.add(cls);
    }
  }
}

const dropClass = (cls: string) => needsStrongEvidence(cls) && looksLikeHashedWord(cls);

let checked = 0;
let differed = 0;
const failures: string[] = [];

for (const e of withRaw) {
  const input = parseSignatureInput(e.signatureInput);
  // firme non strutturali (controlli a livello di documento): niente da ricalcolare
  if (!input || input.vendor) continue;

  const oldStyle = composeLegacy(input, permissive);
  const current: string = String(e.componentSignature).replace(/^banner-consenso > /, '');
  const rederived = rederiveFromComposed(oldStyle, dropClass);

  checked++;
  if (oldStyle !== current) differed++;
  if (rederived !== current && failures.length < 8) {
    failures.push(
      `  vecchia:     ${oldStyle}\n  ricalcolata: ${rederived}\n  attesa:      ${current}`,
    );
  }
}

console.log(`evidenze verificate: ${checked}`);
console.log(`firme che la 0.2.2 avrebbe prodotto diverse: ${differed}`);

assert.equal(
  failures.length,
  0,
  `il ricalcolo non riproduce la firma corrente in ${failures.length} casi:\n${failures.join('\n\n')}`,
);
assert.ok(
  checked > 0,
  'nessuna evidenza confrontabile: il test non sta verificando niente',
);

console.log('Ricalcolo su scansioni precedenti: proprieta di andata e ritorno verificata.');
