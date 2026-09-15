/**
 * Identita' strutturale: classi e id.
 *
 * Ogni caso qui sotto e' stato osservato su un sito in produzione, non
 * inventato. La funzione che decide quali classi e quali id entrano nella
 * firma e' stata sbagliata tre volte, e ogni volta l'errore e' costato
 * all'utente una scansione reale. Questi casi sono il modo di non ripeterlo.
 */
import assert from 'node:assert/strict';
import {
  isJunkLiteral,
  looksLikeHashedWord,
  resolveStableIds,
} from '../src/core/identity.js';
import { computeSignature, type SignatureInput } from '../src/core/signature.js';

/* --- classi ------------------------------------------------------------- */

// hash di styled-components osservati su hintogroup.eu: una sola maiuscola
for (const h of ['jxpyrS', 'cbrjlW', 'dfgimQ', 'dseclZ', 'dseclY', 'ekxyAo', 'blmmAh', 'kqJkbv', 'kKfmzi']) {
  assert.ok(looksLikeHashedWord(h), `${h} dovrebbe essere riconosciuta come generata`);
}
// hash tutti minuscoli, senza vocali
for (const h of ['crhcdd', 'mhbfv']) {
  assert.ok(looksLikeHashedWord(h), `${h} dovrebbe essere riconosciuta come generata`);
}
// classi scritte a mano sullo stesso sito: devono sopravvivere
for (const w of ['sezione', 'pixel', 'small', 'red', 'blue', 'green', 'big']) {
  assert.ok(!looksLikeHashedWord(w), `${w} e' una parola, non un hash`);
}
// errori di template
assert.ok(isJunkLiteral('false') && isJunkLiteral('undefined') && !isJunkLiteral('sezione'));

/* --- id ----------------------------------------------------------------- */

// 88 pagine sondate: gli id del CMS stanno su una o due, quelli di UserWay su 58
const registry = {
  'section-accordion-il_potere_del_come': 1,
  'section-accordion-the_power_of_how': 1,
  'sezione-lista-eventi': 2,
  'uw-skip-to-main': 58,
  __next: 88,
};
const ids = resolveStableIds(registry, { sampledPages: 88 });
assert.deepEqual([...ids].sort(), ['__next', 'uw-skip-to-main']);

/* --- effetto sulla firma ------------------------------------------------ */

/** Lo stesso slot su due pagine: a sinistra il CMS ha messo un id, a destra no. */
const withId: SignatureInput = {
  chain: [
    { tag: 'A', classes: [] },
    { tag: 'DIV', classes: ['sezione'], id: 'sezione-lista-eventi' },
    { tag: 'MAIN', classes: ['mx-auto'], landmark: true },
  ],
};
const withoutId: SignatureInput = {
  chain: [
    { tag: 'A', classes: [] },
    { tag: 'DIV', classes: ['sezione'] },
    { tag: 'MAIN', classes: ['mx-auto'], landmark: true },
  ],
};
const stable = new Set(['sezione', 'mx-auto']);

assert.notEqual(
  computeSignature(withId, stable),
  computeSignature(withoutId, stable),
  'senza registro degli id le due firme divergono: e\' il difetto osservato',
);
assert.equal(
  computeSignature(withId, stable, ids),
  computeSignature(withoutId, stable, ids),
  'con il registro degli id lo stesso slot deve produrre una firma sola',
);

console.log('Identita strutturale: classi e id verificati sui casi reali.');
