/**
 * La ripresa di una scansione interrotta deve dare lo stesso risultato di una
 * scansione ininterrotta.
 *
 * E' l'unica proprieta' che rende il checkpoint accettabile. Un ripristino che
 * perde una pagina, ne duplica una, o salta l'analisi del banner di consenso
 * produrrebbe un backlog leggermente diverso da quello "vero" - e nessuno se
 * ne accorgerebbe, perche' sarebbe comunque plausibile.
 *
 * Il test simula l'interruzione sul serio: scansiona, tronca il file di
 * avanzamento a meta' (e a meta' RIGA, come farebbe un processo ucciso mentre
 * scrive), riprende, e confronta.
 */
import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { DEFAULT_SCAN, scanPages } from '../src/scan/scanner.js';
import type { DiscoveredPage, SiteTarget } from '../src/core/types.js';

const BASE = process.argv[2] ?? 'http://localhost:8099';
const CHECKPOINT = '/tmp/a11y-resume-test.jsonl';

const urls = ['/', '/servizi.html', '/contatti.html', '/blog.html', '/chi-siamo.html'];
const pages: DiscoveredPage[] = urls.map((u, i) => ({
  url: BASE + u,
  siteId: 'fixture',
  depth: 0,
  fingerprint: `fp-${i}`,
  urlPattern: u,
}));
const sites: SiteTarget[] = [
  { id: 'fixture', label: 'fixture', baseUrl: BASE, include: [], exclude: [] },
];

const browser = await chromium.launch({
  executablePath: process.env.A11Y_CHROMIUM_PATH || undefined,
  headless: true,
});

/** Impronta di un risultato, indipendente dall'ordine di esecuzione. */
const digest = (results: any[]) =>
  results
    .flatMap((r) => r.evidence.map((e: any) => `${r.url}|${e.checkId}|${e.selector}|${e.componentSignature}`))
    .sort()
    .join('\n');

try {
  await rm(CHECKPOINT, { force: true });
  const opts = { ...DEFAULT_SCAN, concurrency: 2, screenshots: false };

  // 1. scansione ininterrotta, senza checkpoint: il riferimento
  const reference = await scanPages(browser, pages, sites, opts);

  // 2. scansione con checkpoint, poi interruzione simulata
  await rm(CHECKPOINT, { force: true });
  await scanPages(browser, pages, sites, { ...opts, checkpointPath: CHECKPOINT });

  const lines = (await readFile(CHECKPOINT, 'utf8')).split('\n').filter((l) => l.trim());
  assert.equal(lines.length, pages.length, 'il checkpoint deve contenere una riga per pagina');

  // taglia a meta', e lascia l'ultima riga TRONCATA come farebbe un kill
  const half = Math.max(1, Math.floor(lines.length / 2));
  await writeFile(CHECKPOINT, lines.slice(0, half).join('\n') + '\n' + lines[half].slice(0, 120), 'utf8');

  // 3. ripresa
  const resumed = await scanPages(browser, pages, sites, { ...opts, checkpointPath: CHECKPOINT });

  assert.equal(resumed.length, reference.length, `ripresa: ${resumed.length} pagine invece di ${reference.length}`);
  assert.equal(
    new Set(resumed.map((r) => r.url)).size,
    pages.length,
    'la ripresa ha duplicato o perso una pagina',
  );
  assert.equal(digest(resumed), digest(reference), 'la ripresa produce evidenze diverse dalla scansione intera');

  console.log(`Ripresa verificata: ${reference.length} pagine, ${digest(reference).split('\n').length} evidenze identiche.`);
} finally {
  await browser.close();
  await rm(CHECKPOINT, { force: true });
}
