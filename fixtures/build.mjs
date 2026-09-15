/**
 * Genera un sito di prova che imita l'ecosistema di un ateneo:
 * template condivisi, molte pagine di dettaglio, difetti di accessibilità
 * reali e volutamente distribuiti in punti diversi.
 *
 * Serve a verificare che il motore faccia le cose giuste:
 *  - il clustering deve collassare 40 schede corso in UN template
 *  - la deduplica deve collassare i difetti dell'header in UN finding
 *  - i criteri di giudizio non devono mai uscire come "fail"
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { writeImages } from './png.mjs';

const OUT = path.resolve('fixtures/site');

/* CSS condiviso: contiene due difetti globali che devono emergere come
   problemi di componente, non come problemi di pagina. */
const CSS = `
:root { font-family: system-ui, sans-serif; }
body { margin: 0; color: #222; }
/* DIFETTO: outline del focus rimosso senza sostituto (2.4.7) */
a:focus, button:focus, input:focus, select:focus { outline: none; }
.site-header { background: #1b3a6b; color: #fff; padding: 12px 20px; }
.site-header a { color: #dbe6f5; margin-right: 14px; }
.main-menu { list-style: none; display: flex; gap: 16px; padding: 0; margin: 8px 0 0; }
.main-menu a { text-decoration: none; }
.wrap { max-width: 900px; margin: 0 auto; padding: 20px; }
/* DIFETTO: contrasto insufficiente (1.4.3) */
.muted { color: #a8a8a8; }
.card { border: 1px solid #ddd; padding: 14px; margin-bottom: 12px; }
.card h3 { margin: 0 0 6px; }
/* DIFETTO: larghezza fissa che sfora a 320px (1.4.10) */
.data-table { width: 760px; border-collapse: collapse; }
.data-table th, .data-table td { border: 1px solid #ccc; padding: 6px 10px; }
.site-footer { background: #eee; padding: 18px 20px; margin-top: 30px; }
/* DIFETTO: contrasto che peggiora in hover (1.4.3, invisibile ad axe) */
.cta { background: #1b3a6b; color: #fff; padding: 8px 14px; display: inline-block; text-decoration: none; }
.cta:hover { color: #4a6fa5; }
.clipped { height: 40px; overflow: hidden; }
`;

const header = (active = '') => `
<header class="site-header">
  <a href="/"><img src="/img/logo-ateneo-2024-v3.png" alt="logo-ateneo-2024-v3"></a>
  <nav>
    <ul class="main-menu">
      <li><a href="/corsi">Corsi</a></li>
      <li><a href="/notizie">Notizie</a></li>
      <li><a href="/contatti">Contatti</a></li>
      <li><a href="/biblioteca" target="_blank">Biblioteca</a></li>
    </ul>
  </nav>
  <nav>
    <ul class="main-menu">
      <li><a href="/intranet">Intranet</a></li>
      <li><a href="/webmail">Webmail</a></li>
    </ul>
  </nav>
</header>`;

const consentBanner = () => `
<div id="cookie-wall" style="position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#111;color:#fff;padding:20px;display:flex;gap:16px;align-items:center;justify-content:center">
  <p style="margin:0">Questo sito utilizza cookie tecnici e di profilazione per migliorare l'esperienza di navigazione.</p>
  <!-- DIFETTO: il pulsante e' fuori dall'ordine di tabulazione: da tastiera il muro e' insuperabile -->
  <a href="/privacy" style="color:#444">Informativa estesa</a>
  <button type="button" tabindex="-1" onclick="document.getElementById('cookie-wall').remove()" style="padding:8px 18px">Accetta tutti</button>
</div>`;

/* Contenuto caricato in differita: senza scroll non esiste nel DOM.
   DIFETTO: l'immagine aggiunta non ha alt. */
const lazyScript = () => `
<script>
(function () {
  var done = false;
  window.addEventListener('scroll', function () {
    if (done) return;
    if (window.scrollY + window.innerHeight < document.body.scrollHeight * 0.4) return;
    done = true;
    var s = document.createElement('section');
    s.innerHTML = '<h2>Approfondimenti</h2>' +
      '<img src="/img/campus.jpg">' +
      '<p><a href="/corsi">Leggi tutto</a></p>';
    document.querySelector('main, .wrap').appendChild(s);
  }, { passive: true });
})();
<\/script>`;

const footer = () => `
<footer class="site-footer">
  <p class="muted">Ateneo di prova — via Esempio 1 — P.IVA 00000000000</p>
  <p><a href="/privacy">Leggi tutto</a> · <a href="/note-legali">Leggi tutto</a></p>
  <img src="/img/decorazione.png" alt="immagine">
</footer>`;

const page = ({ title, body, lang = 'it', withMain = true }) => `<!doctype html>
<html${lang ? ` lang="${lang}"` : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="/style.css">
</head>
<body class="${body.bodyClass ?? ''}">
${header()}
${withMain ? '<main class="wrap">' : '<div class="wrap">'}
${body.html}
${withMain ? '</main>' : '</div>'}
${footer()}
${consentBanner()}
${lazyScript()}
</body>
</html>`;

const CORSI = [
  'Informatica', 'Matematica', 'Fisica', 'Biotecnologie', 'Economia aziendale',
  'Giurisprudenza', 'Lettere moderne', 'Lingue e culture', 'Filosofia', 'Storia',
  'Scienze motorie', 'Infermieristica', 'Medicina', 'Odontoiatria', 'Farmacia',
  'Ingegneria gestionale', 'Scienze della formazione', 'Psicologia', 'Sociologia',
  'Beni culturali', 'Architettura', 'Chimica', 'Geologia', 'Agraria',
  'Scienze politiche', 'Statistica', 'Marketing', 'Data science', 'Design',
  'Comunicazione', 'Biologia marina', 'Astronomia', 'Neuroscienze', 'Robotica',
  'Nanotecnologie', 'Bioinformatica', 'Logistica', 'Turismo', 'Enologia', 'Musicologia',
];

const NEWS = [
  'Aperte le immatricolazioni per l anno accademico',
  'Nuovo laboratorio di ricerca inaugurato in ateneo',
  'Bando per borse di studio internazionali',
  'Conferenza sulla transizione digitale',
  'Risultati della valutazione della ricerca',
  'Al via il progetto di orientamento nelle scuole',
  'Accordo di cooperazione con atenei europei',
  'Premio di laurea per tesi sulla sostenibilita',
];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function write(rel, html) {
  const full = path.join(OUT, rel);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, html, 'utf8');
}

const urls = [];
const track = (u) => { urls.push(u); return u; };

/* ---------- home ---------- */
await write('index.html', page({
  title: 'Ateneo di prova — Home',
  body: {
    bodyClass: 'path-frontpage',
    html: `
<h1>Benvenuti nell'Ateneo di prova</h1>
<p>Un ateneo pubblico con <span class="muted">oltre 25.000 studenti</span> e tre poli didattici.</p>
<h3>In evidenza</h3>
<div class="card">
  <h3>Immatricolazioni aperte</h3>
  <p>Le iscrizioni ai corsi di laurea sono aperte fino al 30 settembre.</p>
  <a class="cta" href="/corsi">Scopri di più</a>
</div>
<div class="card">
  <h3>Orientamento</h3>
  <p>Incontri di orientamento per le scuole superiori.</p>
  <a class="cta" href="/notizie">Leggi tutto</a>
</div>
<p><a href="/documenti/guida.pdf" target="_blank">Guida dello studente</a></p>
<img src="/img/campus.jpg" alt="Foto">
`,
  },
}));
track('/');

/* ---------- elenco corsi ---------- */
await write('corsi/index.html', page({
  title: 'Corsi di laurea',
  body: {
    bodyClass: 'page-corsi views-listing',
    html: `
<h1>Corsi di laurea</h1>
<p>Sono attivi ${CORSI.length} corsi di laurea.</p>
${CORSI.map((c) => `<div class="card">
  <h3><a href="/corsi/${slug(c)}">${c}</a></h3>
  <p class="muted">Laurea triennale — 180 CFU</p>
  <a href="/corsi/${slug(c)}">Leggi tutto</a>
</div>`).join('\n')}
`,
  },
}));
track('/corsi');

/* ---------- schede corso: stesso template, 40 pagine ---------- */
for (const c of CORSI) {
  const s = slug(c);
  await write(`corsi/${s}/index.html`, page({
    title: `${c} — Corsi di laurea`,
    body: {
      bodyClass: 'page-node-type-corso',
      html: `
<h1>${c}</h1>
<p class="muted">Dipartimento di ${c} — sede centrale</p>
<img src="/img/corso-${s}.jpg" alt="corso ${s}">
<h3>Obiettivi formativi</h3>
<p>Il corso forma figure professionali capaci di operare nel settore.</p>
<h2>Piano di studi</h2>
<table class="data-table">
  <tr><td>Primo anno</td><td>Fondamenti</td><td>12 CFU</td><td>Prof. Rossi</td></tr>
  <tr><td>Secondo anno</td><td>Metodi avanzati</td><td>12 CFU</td><td>Prof. Bianchi</td></tr>
  <tr><td>Terzo anno</td><td>Tirocinio</td><td>9 CFU</td><td>Prof. Verdi</td></tr>
</table>
<p><a class="cta" href="/iscrizione">Iscriviti</a> <a href="/corsi">Leggi tutto</a></p>
<div class="clipped"><p>Nota informativa sul corso che viene tagliata quando si aumenta la spaziatura del testo come previsto dalle linee guida.</p></div>
`,
    },
  }));
  track(`/corsi/${s}`);
}

/* ---------- notizie: altro template, senza main e senza h1 ---------- */
await write('notizie/index.html', page({
  title: 'Notizie',
  body: {
    bodyClass: 'page-notizie views-listing',
    html: `
<h1>Notizie</h1>
${NEWS.map((n) => `<div class="card">
  <h3><a href="/notizie/${slug(n)}">${n}</a></h3>
  <p class="muted">12 settembre 2026</p>
  <a href="/notizie/${slug(n)}">Leggi tutto</a>
</div>`).join('\n')}
`,
  },
}));
track('/notizie');

for (const n of NEWS) {
  const s = slug(n);
  await write(`notizie/${s}/index.html`, page({
    title: `${n}`,
    withMain: false, // DIFETTO: manca il landmark main (1.3.1, 2.4.1)
    body: {
      bodyClass: 'page-node-type-notizia',
      html: `
<h2>${n}</h2>
<p class="muted">Pubblicato il 12 settembre 2026</p>
<img src="/img/news-${s}.jpg" alt="">
<h4>Dettagli</h4>
<p>Testo della notizia con informazioni di dettaglio per la comunità accademica.</p>
<p><a href="/notizie">Leggi tutto</a></p>
`,
    },
  }));
  track(`/notizie/${s}`);
}

/* ---------- contatti: form pieno di difetti ---------- */
await write('contatti/index.html', page({
  title: 'Contatti',
  body: {
    bodyClass: 'page-contatti page-form',
    html: `
<h1>Contatti</h1>
<form action="/invia" method="post">
  <p><input type="text" name="nome" placeholder="Nome e cognome"></p>
  <p><input type="email" name="email" placeholder="Indirizzo email"></p>
  <p><input type="tel" name="telefono" placeholder="Telefono"></p>
  <p>
    <input type="radio" name="tipo" value="studente" id="t1"> <label for="t1">Studente</label>
    <input type="radio" name="tipo" value="docente" id="t2"> <label for="t2">Docente</label>
    <input type="radio" name="tipo" value="altro" id="t3"> <label for="t3">Altro</label>
  </p>
  <p><textarea name="messaggio" placeholder="Il tuo messaggio" required></textarea></p>
  <p><button type="submit" tabindex="3">Invia</button></p>
</form>
<h3>Sedi</h3>
<p class="muted">Sede centrale, via Esempio 1</p>
<p><a href="https://maps.example.org/ateneo-di-prova-sede-centrale-via-esempio-1">https://maps.example.org/ateneo-di-prova-sede-centrale-via-esempio-1</a></p>
`,
  },
}));
track('/contatti');

/* ---------- pagina senza lang ---------- */
await write('privacy/index.html', page({
  title: 'Privacy',
  lang: '', // DIFETTO: manca l'attributo lang (3.1.1)
  body: {
    bodyClass: 'page-privacy',
    html: `<h1>Informativa privacy</h1><p>Testo dell'informativa.</p>`,
  },
}));
track('/privacy');

await write('note-legali/index.html', page({
  title: 'Note legali',
  body: { bodyClass: 'page-note-legali', html: `<h1>Note legali</h1><p>Testo delle note legali.</p>` },
}));
track('/note-legali');

await write('style.css', CSS);

/* ---------- sitemap ---------- */
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>http://localhost:8099${u}</loc></url>`).join('\n')}
</urlset>`;
await write('sitemap.xml', sitemap);

const imgNames = [
  'logo-ateneo-2024-v3.png', 'decorazione.png', 'campus.jpg',
  ...CORSI.map((c) => `corso-${slug(c)}.jpg`),
  ...NEWS.map((n) => `news-${slug(n)}.jpg`),
];
await writeImages(path.join(OUT, 'img'), imgNames);

console.log(`Sito di prova generato: ${urls.length} pagine e ${imgNames.length} immagini in ${OUT}`);
