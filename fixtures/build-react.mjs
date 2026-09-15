/**
 * Secondo sito di prova: imita un'applicazione React con CSS-in-JS.
 *
 * Esiste per una ragione precisa. Il primo fixture usava classi semantiche
 * scritte a mano (.site-header, .main-menu) - cioe' esattamente il mondo in
 * cui il fingerprinting per nome di classe funziona sempre. Il motore e' stato
 * validato contro le proprie assunzioni, e alla prima prova su un sito vero
 * (React + CSS-in-JS, 108 classi generate su 128) il clustering e' collassato:
 * 617 pagine su 632 finite nel cestino dei "gruppi eterogenei", e la deduplica
 * ha prodotto 11 finding per un problema solo.
 *
 * Qui quel mondo viene riprodotto di proposito:
 *  - classi hashate, diverse per ogni istanza dello stesso componente
 *  - una classe di wrapper condivisa fra pagine (deve sopravvivere al filtro)
 *  - id generati in stile React useId (":r0:"), non validi come selettori CSS
 *  - widget di terze parti: reCAPTCHA, UserWay, YouTube
 *  - banner di consenso fatto in casa, con un testo che NON corrisponde a
 *    nessun modello riconosciuto: serve a provare la diagnostica assistita
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { writeImages } from './png.mjs';

const OUT = path.resolve('fixtures/site-react');
const PORT = 8098;

/** Hash deterministico in stile styled-components: breve, caso misto. */
let seed = 7;
function hash() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let out = '';
  for (let i = 0; i < 6; i++) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    out += chars[seed % chars.length];
  }
  // garantisce maiuscole e minuscole mescolate
  return out[0].toLowerCase() + out.slice(1, 3).toUpperCase() + out.slice(3).toLowerCase();
}

/* Classi condivise fra tutte le pagine: sono le uniche che il motore deve
   riconoscere come strutturali, perche' ricorrono ovunque. */
const SHARED = { shell: hash(), header: hash(), main: hash(), card: hash(), footer: hash() };

const CSS = `
:root { font-family: system-ui, sans-serif; }
body { margin: 0; color: #1a1a1a; }
.${SHARED.header} { background: #101322; color: #fff; padding: 14px 24px; display: flex; gap: 20px; align-items: center; }
.${SHARED.header} a { color: #c9d2e8; text-decoration: none; }
/* DIFETTO: outline del focus rimosso senza sostituto (2.4.7) */
a:focus, button:focus, input:focus { outline: none; }
.${SHARED.main} { max-width: 980px; margin: 0 auto; padding: 24px; }
.${SHARED.card} { border: 1px solid #e3e3e6; border-radius: 10px; padding: 18px; margin-bottom: 14px; }
/* DIFETTO: contrasto insufficiente (1.4.3) */
.meta-line { color: #a5a5ab; font-size: 14px; }
.${SHARED.footer} { background: #f2f2f4; padding: 22px 24px; margin-top: 36px; }
.wide-grid { width: 880px; }
.clamped { height: 44px; overflow: hidden; }
`;

/** Ogni istanza della card riceve una classe propria: e' il caso che rompeva tutto. */
const card = (title, href, meta) => `
<div class="${SHARED.card} ${hash()}">
  <h3 class="${hash()}"><a href="${href}">${title}</a></h3>
  <p class="meta-line ${hash()}">${meta}</p>
  <div class="clamped ${hash()}"><p>Testo di anteprima che viene tagliato quando si aumenta la spaziatura come previsto dalle linee guida.</p></div>
  <a href="${href}" class="${hash()}">Leggi tutto</a>
</div>`;

const header = () => `
<header class="${SHARED.header} ${hash()}">
  <a href="/"><img src="/img/logo.png" alt="logo"></a>
  <nav class="${hash()}">
    <a href="/it/blog">Blog</a>
    <a href="/it/servizi">Servizi</a>
    <a href="/it/contatti">Contatti</a>
  </nav>
  <nav class="${hash()}">
    <a href="/en/blog">EN</a>
  </nav>
</header>`;

/* Terze parti: i loro difetti non devono essere attribuiti al cliente. */
const thirdParties = () => `
<div class="grecaptcha-badge" style="position:fixed;bottom:14px;right:14px;width:70px;height:60px;background:#1a73e8;z-index:500">
  <div class="grecaptcha-logo"><a href="https://www.google.com/recaptcha/">protetto</a></div>
</div>
<div id="userwayAccessibilityIcon" style="position:fixed;bottom:90px;right:14px;z-index:500">
  <span class="uiiw"><img class="ui_w" src="/img/logo.png" alt=""></span>
  <a href="#" style="color:#b9b9bd">Accessibilita</a>
</div>
<iframe src="https://www.youtube.com/embed/xyz" width="200" height="120"></iframe>`;

/* DIFETTO: banner fatto in casa, testo del pulsante non riconoscibile. */
const consent = () => `
<div id="consent-root" class="${hash()}" style="position:fixed;bottom:0;left:0;right:0;z-index:9000;background:#101322;color:#fff;padding:22px;display:flex;gap:18px;align-items:center;justify-content:center">
  <p style="margin:0">Usiamo cookie tecnici e di misurazione per la privacy e il consenso.</p>
  <a href="#" style="color:#7f8497">Gestisci preferenze</a>
  <div role="button" tabindex="0" class="${hash()}" onclick="document.getElementById('consent-root').remove()" style="background:#3d5afe;padding:10px 20px;cursor:pointer">Prosegui con la selezione</div>
</div>`;

const page = ({ title, body, lang = 'it' }) => `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="/style.css">
</head>
<body class="${SHARED.shell} ${hash()}">
${header()}
<main class="${SHARED.main} ${hash()}">
${body}
</main>
<footer class="${SHARED.footer} ${hash()}">
  <p class="meta-line">Azienda di prova — P.IVA 00000000000</p>
  <form class="${hash()}">
    <!-- DIFETTO: id generato da React, nessuna etichetta (3.3.2) -->
    <input id=":r0:" type="email" name="email" placeholder="La tua email">
    <input id=":r1:" type="text" name="nome" placeholder="Il tuo nome">
    <button type="submit">Iscriviti</button>
  </form>
</footer>
${thirdParties()}
${consent()}
</body>
</html>`;

const POSTS = [
  'dockercon-europe-2015', 'drupal-dev-days-2025-leuven', 'atlassian-trend-spotting',
  'modernise-legacy-as400', 'intersection-2024', 'cloud-migration-strategies',
  'design-system-governance', 'accessibilita-e-normativa',
];
const SERVIZI = ['cloud', 'design', 'engineering', 'data', 'process', 'ai'];

const urls = [];
async function write(rel, html) {
  const full = path.join(OUT, rel);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, html, 'utf8');
}

/* Home */
await write('index.html', page({
  title: 'Azienda di prova',
  body: `<h1>Azienda di prova</h1>
<p class="meta-line">Costruiamo prodotti digitali.</p>
<h3>In evidenza</h3>
${POSTS.slice(0, 3).map((p) => card(p.replace(/-/g, ' '), `/it/blog/${p}`, '12 settembre 2026')).join('')}
<table class="wide-grid"><tr><td>Sede</td><td>Milano</td><td>Verona</td><td>Roma</td></tr></table>`,
}));
urls.push('/');

/* Blog: indice + articoli, stesso template */
for (const lang of ['it', 'en']) {
  await write(`${lang}/blog/index.html`, page({
    lang,
    title: 'Blog',
    body: `<h1>Blog</h1>${POSTS.map((p) => card(p.replace(/-/g, ' '), `/${lang}/blog/${p}`, '12 settembre 2026')).join('')}`,
  }));
  urls.push(`/${lang}/blog`);

  for (const p of POSTS) {
    await write(`${lang}/blog/${p}/index.html`, page({
      lang,
      title: p.replace(/-/g, ' '),
      body: `<h1>${p.replace(/-/g, ' ')}</h1>
<p class="meta-line">Pubblicato il 12 settembre 2026</p>
<img src="/img/cover.png" alt="">
<h3>Contesto</h3>
<p>Testo dell'articolo.</p>
<table class="wide-grid"><tr><td>Uno</td><td>Due</td><td>Tre</td><td>Quattro</td></tr></table>
<p><a href="/${lang}/blog">Leggi tutto</a></p>`,
    }));
    urls.push(`/${lang}/blog/${p}`);
  }

  /* Servizi: altro template */
  await write(`${lang}/servizi/index.html`, page({
    lang,
    title: 'Servizi',
    body: `<h1>Servizi</h1>${SERVIZI.map((sv) => card(sv, `/${lang}/servizi/${sv}`, 'servizio')).join('')}`,
  }));
  urls.push(`/${lang}/servizi`);

  for (const sv of SERVIZI) {
    await write(`${lang}/servizi/${sv}/index.html`, page({
      lang,
      title: sv,
      body: `<h1>${sv}</h1><p>Descrizione del servizio.</p><img src="/img/cover.png" alt="cover"><p><a href="/${lang}/servizi">Leggi tutto</a></p>`,
    }));
    urls.push(`/${lang}/servizi/${sv}`);
  }

  await write(`${lang}/contatti/index.html`, page({
    lang,
    title: 'Contatti',
    body: `<h1>Contatti</h1><p class="meta-line">Scrivici.</p>`,
  }));
  urls.push(`/${lang}/contatti`);
}

await write('style.css', CSS);
await write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>http://localhost:${PORT}${u}</loc></url>`).join('\n')}
</urlset>`);

await writeImages(path.join(OUT, 'img'), ['logo.png', 'cover.png']);

console.log(`Sito React di prova: ${urls.length} pagine in ${OUT}`);
console.log(`Classi condivise (devono sopravvivere al filtro):`, Object.values(SHARED).join(', '));
