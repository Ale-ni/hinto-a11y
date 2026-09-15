/**
 * Varianti linguistiche: casi reali osservati su hintogroup.eu.
 *
 * Ridurre il campionamento di una lingua e' un compromesso deliberato sulla
 * copertura, quindi deve colpire SOLO le traduzioni. Ogni caso qui sotto
 * corrisponde a un errore che il codice ha commesso davvero sui dati veri.
 */
import assert from 'node:assert/strict';
import { groupByLanguage, languageOf } from '../src/crawl/language.js';

/* --- riconoscimento della lingua nel percorso --- */
assert.equal(languageOf('https://x.eu/it/blog/tdd-parte')?.code, 'it');
assert.equal(languageOf('https://x.eu/en/blog/tdd')?.code, 'en');
assert.equal(languageOf('https://x.eu/pt-BR/blog')?.code, 'pt');
// non e' una lingua: e' contenuto
assert.equal(languageOf('https://x.eu/prodotti/es/scheda'), null);
assert.equal(languageOf('https://x.eu/blog/it-works'), null);

const T = (id: string, urls: string[], pageCount = urls.length) => ({
  fingerprint: id,
  samples: urls.slice(0, 3),
  memberUrls: urls,
  pageCount,
});

/* --- caso 1: coppia IT/EN con lo stesso slug --- */
{
  const it = T('it-blog', ['https://x.eu/it/blog/a', 'https://x.eu/it/blog/b'], 268);
  const en = T('en-blog', ['https://x.eu/en/blog/a', 'https://x.eu/en/blog/b'], 101);
  const g = groupByLanguage([it, en]);
  assert.deepEqual(g.primary.map((t) => t.fingerprint), ['it-blog']);
  assert.equal(g.secondary.length, 1);
  assert.equal(g.secondary[0].code, 'en');
}

/* --- caso 2: due template ITALIANI non sono traduzioni l'uno dell'altro ---
 * Il codice li univa perche' i percorsi hanno la stessa forma, e ne riduceva
 * uno a controllo a campione: copertura persa in silenzio su pagine mai
 * tradotte.                                                                */
{
  const a = T('it-blog-1', ['https://x.eu/it/blog/a'], 268);
  const b = T('it-blog-2', ['https://x.eu/it/blog/b'], 25);
  const g = groupByLanguage([a, b]);
  assert.equal(g.secondary.length, 0, 'due template della stessa lingua non sono varianti');
  assert.equal(g.primary.length, 2);
}

/* --- caso 3: transitivita'. it-1 <-> en, en <-> it-2: tutti e tre in una
 * famiglia. Devono restare pieni ENTRAMBI gli italiani.                     */
{
  const it1 = T('it-1', ['https://x.eu/it/blog/a'], 268);
  const en = T('en-1', ['https://x.eu/en/blog/a'], 101);
  const it2 = T('it-2', ['https://x.eu/it/blog/c'], 25);
  const g = groupByLanguage([it1, en, it2]);
  assert.deepEqual(
    g.primary.map((t) => t.fingerprint).sort(),
    ['it-1', 'it-2'],
    'nella famiglia resta piena tutta la lingua prevalente, non il solo template piu grande',
  );
  assert.deepEqual(g.secondary.map((s) => s.template.fingerprint), ['en-1']);
}

/* --- caso 4: slug tradotti. /it/eventi e /en/events non hanno la stessa
 * forma di percorso: solo hreflang puo' appaiarli.                          */
{
  const it = T('it-eventi', ['https://x.eu/it/eventi/x'], 59);
  const en = T('en-events', ['https://x.eu/en/events/x'], 19);

  const senza = groupByLanguage([it, en]);
  assert.equal(senza.secondary.length, 0, 'senza hreflang gli slug tradotti non si appaiano');

  const alternates = new Map([
    ['https://x.eu/it/eventi/x', ['https://x.eu/en/events/x']],
    ['https://x.eu/en/events/x', ['https://x.eu/it/eventi/x']],
  ]);
  const con = groupByLanguage([it, en], alternates);
  assert.deepEqual(con.primary.map((t) => t.fingerprint), ['it-eventi']);
  assert.deepEqual(con.secondary.map((s) => s.template.fingerprint), ['en-events']);
}

/* --- caso 5: un sito monolingua non deve essere toccato --- */
{
  const a = T('home', ['https://x.eu/'], 1);
  const b = T('servizi', ['https://x.eu/servizi/ai'], 12);
  const g = groupByLanguage([a, b]);
  assert.equal(g.secondary.length, 0);
  assert.equal(g.primary.length, 2);
}

console.log('Varianti linguistiche: cinque casi reali verificati.');
