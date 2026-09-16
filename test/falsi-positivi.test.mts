/**
 * Falsi positivi osservati su siti reali.
 *
 * Ogni caso qui sotto e' stato trovato guardando i dati di una scansione vera,
 * non immaginato. Sono i due modi in cui il motore attribuiva al cliente
 * qualcosa che non era suo: i difetti di un altro sito raggiunto per
 * reindirizzamento, e le misure di contrasto rese impossibili da un overlay.
 */
import assert from 'node:assert/strict';
import { stessoSito } from '../src/crawl/crawler.js';
import { misuraImpeditaDaSovrapposizione } from '../src/scan/axeRunner.js';

/* --- reindirizzamenti fuori sito ------------------------------------- */

// il caso reale: un articolo di tef.tech rimandava al sito di Bocconi, e
// ventisette difetti altrui sono finiti nel rapporto del cliente
assert.equal(
  stessoSito('https://www.unibocconi.it/news/x', 'https://tef.tech/news/for-a-future-full-of-winning-ideas'),
  false,
  'un reindirizzamento a un altro dominio deve essere riconosciuto',
);

// varianti che NON sono uscite dal sito
assert.ok(stessoSito('https://www.tef.tech/x', 'https://tef.tech/x'), 'www e non-www sono lo stesso sito');
assert.ok(stessoSito('https://tef.tech/x', 'http://tef.tech/x'), 'http e https sono lo stesso sito');
assert.ok(stessoSito('https://tef.tech/a?b=1', 'https://tef.tech/a'), 'la query non cambia il sito');

// un sottodominio e' un altro sito: va deciso da chi configura, non indovinato
assert.equal(stessoSito('https://blog.tef.tech/x', 'https://tef.tech/x'), false);
assert.equal(stessoSito('https://www.linkedin.com/company/x', 'https://tef.tech/x'), false);
assert.equal(stessoSito('non-un-url', 'https://tef.tech/x'), false);

/* --- contrasto impedito da un overlay -------------------------------- */

// messaggi veri di axe, copiati dai dati di tef.tech
const sovrapposti = [
  [{ id: 'color-contrast', message: "Element's background color could not be determined because it is overlapped by another element" }],
  [{ id: 'color-contrast', message: "Element's background color could not be determined because it partially overlaps other elements" }],
];
for (const c of sovrapposti) {
  assert.ok(misuraImpeditaDaSovrapposizione(c), `da scartare: ${c[0].message.slice(0, 60)}`);
}

// dubbi VERI: restano in coda di revisione, li scioglie una persona guardando
const daTenere = [
  [{ id: 'color-contrast', message: "Element's background color could not be determined because element contains an image node" }],
  [{ id: 'color-contrast', message: "Element's background color could not be determined due to a background gradient" }],
  [{ id: 'color-contrast', message: 'Element has insufficient color contrast of 3.16 (foreground color: #999999, background color: #494949)' }],
];
for (const c of daTenere) {
  assert.equal(misuraImpeditaDaSovrapposizione(c), false, `da tenere: ${c[0].message.slice(0, 60)}`);
}

assert.equal(misuraImpeditaDaSovrapposizione(undefined), false);
assert.equal(misuraImpeditaDaSovrapposizione([]), false);

console.log('Falsi positivi: reindirizzamenti fuori sito e contrasto sotto overlay verificati sui casi reali.');
