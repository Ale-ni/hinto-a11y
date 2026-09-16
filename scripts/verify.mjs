#!/usr/bin/env node
/**
 * Suite di regressione.
 *
 * Non e' una formalita': in una sola giornata di sviluppo ha intercettato due
 * regressioni vere che nessuno avrebbe notato guardando l'output a occhio -
 * due pagine 404 che facevano collassare il clustering dell'intero sito, e una
 * sonda diagnostica che corrompeva la misura del percorso da tastiera eseguita
 * subito dopo. Entrambe si manifestavano come "meno risultati", che e' il modo
 * piu' silenzioso di sbagliare.
 *
 * Gira in locale con `npm run verify` e in CI a ogni push.
 */
import { spawn } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';

const CHROMIUM = process.env.A11Y_CHROMIUM_PATH;
let failures = 0;

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: opts.quiet ? 'ignore' : 'inherit',
      env: { ...process.env, ...(CHROMIUM ? { A11Y_CHROMIUM_PATH: CHROMIUM } : {}) },
    });
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} -> uscita ${code}`)),
    );
    child.on('error', reject);
  });
}

function serve(script) {
  const child = spawn('node', [script], { stdio: 'ignore', detached: false });
  return child;
}

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  OK    ${label}${detail ? '  (' + detail + ')' : ''}`);
  } else {
    console.log(`  FALLITO  ${label}${detail ? '  (' + detail + ')' : ''}`);
    failures++;
  }
}

async function loadRun(dir) {
  return JSON.parse(await readFile(`${dir}/run.json`, 'utf8'));
}

/** Quanti finding distinti nascono da un dato check. */
function findingsFromCheck(run, checkId) {
  const byId = new Map(run.evidence.map((e) => [e.id, e]));
  return run.findings.filter((f) => byId.get(f.evidenceIds[0])?.checkId === checkId).length;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('Preparazione dei siti di prova...');
  await run('node', ['fixtures/build.mjs'], { quiet: true });
  await run('node', ['fixtures/build-react.mjs'], { quiet: true });
  await rm('out', { recursive: true, force: true });
  await rm('out-react', { recursive: true, force: true });

  const servers = [serve('fixtures/serve.mjs'), serve('fixtures/serve-react.mjs')];
  await wait(1500);

  try {
    /* ---------------- fixture classico ---------------- */
    console.log('\n=== Sito di prova classico (classi semantiche) ===');
    await run('npx', ['tsx', 'src/cli/index.ts', 'audit', 'config.fixture.json'], { quiet: true });
    const classic = await loadRun('out');

    const PLANTED = [
      'landmark-no-main',
      'keyboard-positive-tabindex',
      'axe:html-has-lang',
      'contrast-hover-insufficient',
      'text-spacing-clipped',
      'img-alt-is-filename',
      'form-radiogroup-no-fieldset',
      'reflow-overflowing-element',
    ];
    const seen = new Set(classic.evidence.map((e) => e.checkId));
    const found = PLANTED.filter((c) => seen.has(c));
    check('tutti i difetti piantati sono rilevati', found.length === PLANTED.length,
      `${found.length}/${PLANTED.length}` +
        (found.length < PLANTED.length
          ? ' mancanti: ' + PLANTED.filter((c) => !seen.has(c)).join(', ')
          : ''));

    check('il clustering separa i template', classic.templates.length >= 6,
      `${classic.templates.length} template`);
    check('la deduplica comprime', classic.stats.dedupeRatio >= 5,
      `${classic.stats.dedupeRatio}x`);
    check('il banner di consenso viene chiuso',
      !classic.evidence.some((e) => e.checkId === 'consent-not-dismissable'));
    check('il contenuto differito viene analizzato',
      classic.evidence.some((e) => (e.selector || '').includes('section')));

    /* ---------------- fixture React ---------------- */
    console.log('\n=== Sito di prova React (classi generate) ===');
    await run('npx', ['tsx', 'src/cli/index.ts', 'audit', 'config.react.json'], { quiet: true });
    const react = await loadRun('out-react');

    check('le classi generate sono riconosciute', react.generatedClassRatio > 0.8,
      `${Math.round(react.generatedClassRatio * 100)}% generate`);
    check('la deduplica regge sulle classi generate',
      findingsFromCheck(react, 'link-generic-text') === 1,
      `${react.evidence.filter((e) => e.checkId === 'link-generic-text').length} evidenze -> ` +
        `${findingsFromCheck(react, 'link-generic-text')} finding`);
    check('il clustering regge sulle classi generate',
      react.templates.length >= 4 && react.templates.length <= 9,
      `${react.templates.length} template`);
    check('le terze parti sono attribuite al fornitore',
      react.findings.filter((f) => f.owner === 'fornitore-terzo').length >= 3,
      `${react.findings.filter((f) => f.owner === 'fornitore-terzo').length} finding`);
    check('il banner configurato viene chiuso',
      !react.evidence.some((e) => e.checkId === 'consent-not-dismissable'));

    /* ---------------- autodiagnosi ---------------- */
    console.log('\n=== Autodiagnosi dell analisi ===');
    for (const [name, r] of [['classico', classic], ['react', react]]) {
      const q = r.quality ?? { issues: [], trustworthy: true };
      const blocking = q.issues.filter((i) => i.severity === 'bloccante');
      check(`nessuna anomalia bloccante nell analisi (${name})`, blocking.length === 0,
        blocking.length ? blocking[0].message.slice(0, 80) : `${q.issues.length} note minori`);
      // il controllo piu' importante: nessun problema contato due volte
      const dup = q.issues.find((i) => i.kind === 'duplicate-findings');
      check(`nessun finding duplicato (${name})`, !dup, dup ? dup.samples[0] ?? dup.message.slice(0, 70) : '');
    }

    /* ---------------- qualita' dei testi ---------------- */
    console.log('\n=== Qualita dei testi consegnati al cliente ===');
    for (const [name, r] of [['classico', classic], ['react', react]]) {
      const broken = r.evidence.filter((e) => /undefined|NaN|\[object Object\]/.test(e.observation));
      check(`nessun segnaposto non risolto nelle osservazioni (${name})`, broken.length === 0,
        broken.length ? broken[0].observation.slice(0, 70) : '');
      const english = r.findings.filter((f) => /^(Ensure|Elements|Documents|Users)\b/.test(f.title));
      check(`nessun titolo rimasto in inglese (${name})`, english.length === 0,
        english.length ? english[0].title.slice(0, 60) : '');
    }

    /* ---------------- scansioni gia' pagate ---------------- */
    console.log('\n=== Ricalcolo su scansioni di versioni precedenti ===');
    await run('npx', ['tsx', 'test/rederive.test.mts', 'out-react/run.json'], { quiet: true });
    check('una scansione vecchia ricalcolata da lo stesso risultato di una rilanciata', true);

    /* ---------------- ripresa dopo interruzione ---------------- */
    console.log('\n=== Ripresa di una scansione interrotta ===');
    await run('npx', ['tsx', 'test/resume.test.mts', 'http://localhost:8099'], { quiet: true });
    check('riprendere da un checkpoint da lo stesso risultato di una scansione intera', true);

    /* ---------------- identita' strutturale ---------------- */
    console.log('\n=== Identita strutturale (casi reali) ===');
    await run('npx', ['tsx', 'test/identity.test.mts'], { quiet: true });
    check('classi generate e id di contenuto restano fuori dalle firme', true);

    /* ---------------- varianti linguistiche ---------------- */
    console.log('\n=== Varianti linguistiche ===');
    await run('npx', ['tsx', 'test/language.test.mts'], { quiet: true });
    check('solo le traduzioni scendono a controllo a campione', true);

    /* ---------------- falsi positivi da siti reali ---------------- */
    console.log('\n=== Falsi positivi osservati su siti reali ===');
    await run('npx', ['tsx', 'test/falsi-positivi.test.mts'], { quiet: true });
    check('reindirizzamenti fuori sito e contrasto sotto overlay riconosciuti', true);

    /* ---------------- vincolo non negoziabile ---------------- */
    console.log('\n=== Tetto ai verdetti automatici ===');
    await run('npx', ['tsx', 'test/triage-cap.test.mts'], { quiet: true });
    check('il modello non puo promuovere un verdetto oltre il tetto del criterio', true);
  } finally {
    for (const s of servers) s.kill('SIGTERM');
  }

  console.log(
    failures === 0
      ? '\nTutti i controlli superati.'
      : `\n${failures} controlli falliti.`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nErrore durante la verifica:', err.message);
  process.exit(1);
});
