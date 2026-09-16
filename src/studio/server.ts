/**
 * Studio: l'interfaccia locale per chi non usa il terminale.
 *
 * Due designer devono poter condurre un audit senza diventare sviluppatori.
 * Non significa nascondere il motore: significa non chiedere loro di ricordare
 * comandi, percorsi e ordine delle fasi.
 *
 * Perche' un server locale e non un'applicazione web vera:
 *
 *   - la scansione deve raggiungere il sito del cliente dalla rete di chi
 *     lavora, e deve aprire un browser vero;
 *   - `consent-setup` apre una finestra visibile su cui la persona clicca;
 *   - i risultati contengono contenuti dei clienti e restano sul disco di chi
 *     conduce l'audit, non su un server condiviso.
 *
 * Resta quindi un processo che gira sul portatile, si apre nel browser e non
 * espone nulla all'esterno: ascolta solo su 127.0.0.1.
 *
 * Uso:  npm run studio          (poi si apre da solo su http://127.0.0.1:4173)
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = path.dirname(fileURLToPath(import.meta.url));

/**
 * Due radici distinte, ed e' una distinzione che vale la pena tenere netta.
 *
 * RADICE e' dove sta il CODICE: sorgenti, dipendenze, file di esempio. Si
 * aggiorna sostituendola, e nessuno ci deve mettere niente a mano.
 *
 * DATI e' dove stanno i PROGETTI e i RISULTATI di chi lavora: i `config.*.json`
 * dei clienti, le cartelle `out-*`, le revisioni. E' la cartella che l'utente
 * apre nel Finder, e per questo deve contenere le sue cose e nient'altro.
 *
 * Quando non e' indicato nulla le due coincidono - e' il caso di chi lavora
 * dentro il repository, dove la separazione non serve.
 */
const RADICE = path.resolve(QUI, '..', '..');
const DATI = path.resolve(process.env.A11Y_DATI ?? RADICE);
const PORTA = Number(process.env.A11Y_STUDIO_PORT ?? 4173);

/* ------------------------------------------------------------------ *
 * Stato del lavoro in corso
 * ------------------------------------------------------------------ */

interface Lavoro {
  id: string;
  configFile: string;
  comando: string;
  avviatoIl: number;
  righe: string[];
  processo: ChildProcess | null;
  stato: 'in-corso' | 'completato' | 'interrotto' | 'errore';
  /** Avanzamento dedotto dalle righe "[ 12/ 88]" stampate dallo scanner */
  fatte: number;
  totali: number;
}

let corrente: Lavoro | null = null;
const ascoltatori = new Set<http.ServerResponse>();

function annuncia(evento: string, dati: unknown): void {
  const payload = `event: ${evento}\ndata: ${JSON.stringify(dati)}\n\n`;
  for (const res of ascoltatori) {
    try {
      res.write(payload);
    } catch {
      ascoltatori.delete(res);
    }
  }
}

/** "  [ 12/ 88] https://..." -> avanzamento */
const AVANZAMENTO = /^\s*\[\s*(\d+)\/\s*(\d+)\]/;

function registraRiga(lavoro: Lavoro, riga: string): void {
  // i colori ANSI del terminale non servono in una pagina web
  const pulita = riga.replace(/\x1b\[[0-9;]*m/g, '').trimEnd();
  if (!pulita) return;
  lavoro.righe.push(pulita);
  if (lavoro.righe.length > 4000) lavoro.righe.splice(0, 1000);

  const m = AVANZAMENTO.exec(pulita);
  if (m) {
    lavoro.fatte = Number(m[1]);
    lavoro.totali = Number(m[2]);
  }
  annuncia('riga', { testo: pulita, fatte: lavoro.fatte, totali: lavoro.totali });
}

function avvia(configFile: string, argomenti: string[], etichetta: string): Lavoro {
  /*
   * Il comando vive in RADICE, ma gira in DATI: il file di configurazione e la
   * cartella dei risultati sono relativi a dove lavora l'utente, non a dove sta
   * il codice. Si passa il percorso assoluto di tsx invece di `npx` perche'
   * `npx` cerca i pacchetti a partire dalla cartella corrente, che qui non e'
   * piu' quella del progetto.
   */
  const tsx = path.join(RADICE, 'node_modules', '.bin', 'tsx');
  const cli = path.join(RADICE, 'src', 'cli', 'index.ts');
  const [comando, testa] = existsSync(tsx) ? [tsx, [cli]] : ['npx', ['tsx', cli]];

  const processo = spawn(
    comando,
    [...testa, ...argomenti, configFile],
    { cwd: DATI, env: { ...process.env, FORCE_COLOR: '0' } },
  );

  const lavoro: Lavoro = {
    id: `job-${Date.now()}`,
    configFile,
    comando: etichetta,
    avviatoIl: Date.now(),
    righe: [],
    processo,
    stato: 'in-corso',
    fatte: 0,
    totali: 0,
  };

  const consuma = (buf: Buffer) => {
    for (const riga of buf.toString('utf8').split('\n')) registraRiga(lavoro, riga);
  };
  processo.stdout?.on('data', consuma);
  processo.stderr?.on('data', consuma);

  processo.on('exit', (code, signal) => {
    lavoro.processo = null;
    lavoro.stato = signal ? 'interrotto' : code === 0 ? 'completato' : 'errore';
    annuncia('fine', { stato: lavoro.stato, codice: code });
  });
  processo.on('error', (err) => {
    lavoro.processo = null;
    lavoro.stato = 'errore';
    registraRiga(lavoro, `Impossibile avviare il comando: ${err.message}`);
    annuncia('fine', { stato: 'errore', codice: -1 });
  });

  corrente = lavoro;
  annuncia('inizio', { comando: etichetta, configFile });
  return lavoro;
}

/* ------------------------------------------------------------------ *
 * Progetti
 * ------------------------------------------------------------------ */

interface Progetto {
  file: string;
  nome: string;
  siti: Array<{ label: string; baseUrl: string }>;
  outDir: string;
  esisteRisultato: boolean;
}

async function elencaProgetti(): Promise<Progetto[]> {
  const voci = await readdir(DATI);
  const out: Progetto[] = [];
  for (const v of voci) {
    if (!v.startsWith('config.') || !v.endsWith('.json')) continue;
    try {
      const cfg = JSON.parse(await readFile(path.join(DATI, v), 'utf8'));
      if (!cfg.project || !Array.isArray(cfg.sites)) continue;
      const outDir = cfg.outDir ?? 'out';
      out.push({
        file: v,
        nome: cfg.project,
        siti: cfg.sites.map((s: { label?: string; baseUrl: string }) => ({
          label: s.label ?? s.baseUrl,
          baseUrl: s.baseUrl,
        })),
        outDir,
        esisteRisultato: await esiste(path.join(DATI, outDir, 'run.json')),
      });
    } catch {
      /* file di configurazione illeggibile: si salta, non e' un errore fatale */
    }
  }
  return out.sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
}

async function esiste(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/** Nome file prevedibile a partire dal nome del progetto. */
function nomeFileConfig(nome: string): string {
  const slug = nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `config.${slug || 'progetto'}.json`;
}

/* ------------------------------------------------------------------ *
 * Risultati e revisione
 * ------------------------------------------------------------------ */

async function leggiRun(outDir: string): Promise<any | null> {
  try {
    return JSON.parse(await readFile(path.join(DATI, outDir, 'run.json'), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * La coda di revisione.
 *
 * Contiene i finding che il motore NON puo' decidere da solo. Non e' un
 * ripiego: per una parte dei criteri WCAG nessuno strumento automatico puo'
 * emettere un verdetto, e fingere il contrario sarebbe il modo piu' rapido di
 * consegnare un rapporto sbagliato. Qui la persona guarda e decide.
 *
 * Ordinata per gravita': se il tempo finisce, il lavoro fatto e' quello che
 * conta di piu'.
 */
async function codaRevisione(run: any, outDir: string): Promise<unknown[]> {
  const evidenzePerId = new Map<string, any>(run.evidence.map((e: any) => [e.id, e]));
  const daRivedere = run.findings
    .filter((f: any) => f.verdict === 'needs-review')
    .sort((a: any, b: any) => (b.severity?.score ?? 0) - (a.severity?.score ?? 0));

  return Promise.all(
    daRivedere.map(async (f: any) => {
      const ev = f.evidenceIds.map((id: string) => evidenzePerId.get(id)).filter(Boolean);
      const conFoto = ev.find((e: any) => e.screenshot);
      const pagine = [...new Set(ev.map((e: any) => e.pageUrl).filter(Boolean))];
      return {
        id: f.id,
        titolo: f.title,
        descrizione: f.description,
        correzione: f.remediation,
        componente: f.component,
        criteri: f.criteria ?? [],
        banda: f.severity?.band ?? '',
        punteggio: f.severity?.score ?? 0,
        occorrenze: f.occurrenceCount,
        responsabile: f.owner,
        pagine: pagine.slice(0, 5),
        osservazioni: ev.slice(0, 4).map((e: any) => ({
          testo: e.observation,
          selettore: e.selector,
        })),
        screenshot: conFoto?.screenshot ?? null,
        /** L'interfaccia deve poter dire "foto non trovata" invece di non mostrarla e basta. */
        screenshotMancante: conFoto?.screenshot
          ? !(await trovaImmagine(conFoto.screenshot, outDir))
          : false,
        revisione: f.humanReview ?? null,
      };
    }),
  );
}

/** Come serviFile: si prova il percorso salvato e le varianti relative alla cartella. */
async function trovaImmagine(relativo: string, outDir: string): Promise<boolean> {
  const nomeBase = path.basename(outDir);
  const senza = relativo.startsWith(nomeBase + '/') ? relativo.slice(nomeBase.length + 1) : relativo;
  for (const c of [relativo, path.join(outDir, senza), path.join(outDir, relativo)]) {
    if (await esiste(path.resolve(DATI, c))) return true;
  }
  return false;
}

async function salvaRevisione(
  outDir: string,
  findingId: string,
  esito: string,
  nota: string,
  revisore: string,
): Promise<{ ok: boolean; rimasti: number }> {
  const file = path.join(DATI, outDir, 'run.json');
  const run = JSON.parse(await readFile(file, 'utf8'));
  const f = run.findings.find((x: any) => x.id === findingId);
  if (!f) return { ok: false, rimasti: 0 };

  f.humanReview = { esito, nota, revisore, quando: new Date().toISOString() };

  /**
   * Il verdetto umano sovrascrive quello automatico, ed e' l'unico verso
   * consentito. Il motore puo' solo dire "non lo so"; una persona che ha
   * guardato la pagina puo' dire tutto il resto.
   */
  if (esito === 'non-conforme') f.verdict = 'fail';
  else if (esito === 'conforme') f.verdict = 'pass';

  await writeFile(file, JSON.stringify(run, null, 2), 'utf8');
  const rimasti = run.findings.filter(
    (x: any) => x.verdict === 'needs-review' && !x.humanReview,
  ).length;
  return { ok: true, rimasti };
}

/* ------------------------------------------------------------------ *
 * HTTP
 * ------------------------------------------------------------------ */

const TIPI: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function json(res: http.ServerResponse, dati: unknown, codice = 200): void {
  const corpo = JSON.stringify(dati);
  res.writeHead(codice, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(corpo),
  });
  res.end(corpo);
}

async function corpoJson(req: http.IncomingMessage): Promise<any> {
  const pezzi: Buffer[] = [];
  for await (const p of req) pezzi.push(p as Buffer);
  if (!pezzi.length) return {};
  return JSON.parse(Buffer.concat(pezzi).toString('utf8'));
}

/**
 * Serve un file dal disco restando dentro la radice del progetto.
 *
 * Il server ascolta solo su 127.0.0.1, ma un controllo sul percorso costa una
 * riga e toglie di mezzo la categoria di errore piu' banale.
 */
async function serviFile(
  res: http.ServerResponse,
  relativo: string,
  base?: string | null,
): Promise<void> {
  /**
   * Piu' basi, per la stessa ragione per cui le usa la dashboard.
   *
   * I percorsi degli screenshot sono salvati relativi alla cartella da cui
   * girava la scansione (`out-cliente/screenshots/...`). Se quella cartella
   * viene rinominata o il `run.json` viene spostato, il percorso non risolve
   * piu' e l'immagine sparisce senza errore: il revisore vede una scheda senza
   * foto e non ha modo di sapere se la foto non c'e' o non e' stata trovata.
   * Un audit di accessibilita' condotto senza vedere l'elemento e' esattamente
   * cio' che questa interfaccia deve evitare.
   */
  const candidati = [relativo];
  if (base) {
    const nomeBase = path.basename(base);
    const senzaPrefisso = relativo.startsWith(nomeBase + '/')
      ? relativo.slice(nomeBase.length + 1)
      : relativo;
    candidati.push(path.join(base, senzaPrefisso), path.join(base, relativo));
  }

  for (const c of candidati) {
    const assoluto = path.resolve(DATI, c);
    if (!assoluto.startsWith(DATI + path.sep)) continue;
    if (!(await esiste(assoluto))) continue;
    res.writeHead(200, {
      'content-type': TIPI[path.extname(assoluto)] ?? 'application/octet-stream',
    });
    createReadStream(assoluto).pipe(res);
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('non trovato');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORTA}`);
  const p = url.pathname;

  try {
    /* --- interfaccia --- */
    if (p === '/' || p === '/index.html') {
      const html = await readFile(path.join(QUI, 'ui.html'), 'utf8');
      res.writeHead(200, { 'content-type': TIPI['.html'] });
      res.end(html);
      return;
    }

    /* --- chiusura ---
     * Quando lo Studio gira dentro una finestra applicazione non c'e' nessun
     * Terminale in cui premere Ctrl+C: la chiusura deve poterla chiedere
     * l'interfaccia. Il server ascolta solo su 127.0.0.1, quindi la richiesta
     * puo' arrivare unicamente da questa macchina. */
    if (p === '/api/esci' && req.method === 'POST') {
      json(res, { ok: true });
      setTimeout(() => {
        server.close();
        process.exit(0);
      }, 150);
      return;
    }

    /* --- progetti --- */
    if (p === '/api/progetti' && req.method === 'GET') {
      json(res, { progetti: await elencaProgetti() });
      return;
    }

    if (p === '/api/progetto' && req.method === 'POST') {
      const b = await corpoJson(req);
      const nome = String(b.nome ?? '').trim();
      const url0 = String(b.baseUrl ?? '').trim();
      if (!nome || !url0) {
        json(res, { errore: 'Servono un nome di progetto e un indirizzo del sito.' }, 400);
        return;
      }
      let normalizzato: string;
      try {
        normalizzato = new URL(url0.startsWith('http') ? url0 : `https://${url0}`).origin;
      } catch {
        json(res, { errore: `"${url0}" non sembra un indirizzo valido.` }, 400);
        return;
      }
      const file = nomeFileConfig(nome);
      const slug = file.replace(/^config\./, '').replace(/\.json$/, '');
      const cfg = {
        project: nome,
        outDir: `out-${slug}`,
        sites: [
          {
            id: slug,
            label: b.etichettaSito?.trim() || new URL(normalizzato).hostname,
            baseUrl: normalizzato,
            include: [],
            exclude: b.escludi
              ? String(b.escludi)
                  .split('\n')
                  .map((x: string) => x.trim())
                  .filter(Boolean)
              : [],
          },
        ],
        crawl: { maxPagesPerSite: Number(b.maxPagine) || 800 },
        consent: {},
        scan: {},
        triage: { adapter: 'none' },
      };
      await writeFile(path.join(DATI, file), JSON.stringify(cfg, null, 2) + '\n', 'utf8');
      json(res, { file, progetto: cfg.project });
      return;
    }

    /* --- esecuzione --- */
    if (p === '/api/avvia' && req.method === 'POST') {
      if (corrente?.processo) {
        json(res, { errore: 'C\'è già un\'analisi in corso.' }, 409);
        return;
      }
      const b = await corpoJson(req);
      const file = String(b.configFile ?? '');
      if (!/^config\.[A-Za-z0-9._-]+\.json$/.test(file)) {
        json(res, { errore: 'Progetto non valido.' }, 400);
        return;
      }
      const modo = String(b.modo ?? 'completa');
      const argomenti =
        modo === 'prova'
          ? ['audit', '--smoke']
          : modo === 'riprendi'
            ? ['audit', '--reuse-crawl']
            : modo === 'consenso'
              ? ['consent-setup']
              : ['audit'];
      const etichetta =
        modo === 'prova'
          ? 'Giro di prova'
          : modo === 'riprendi'
            ? 'Ripresa dell\'analisi'
            : modo === 'consenso'
              ? 'Accettazione del banner'
              : 'Analisi completa';
      const lavoro = avvia(file, argomenti, etichetta);
      json(res, { id: lavoro.id, comando: etichetta });
      return;
    }

    if (p === '/api/ferma' && req.method === 'POST') {
      corrente?.processo?.kill('SIGTERM');
      json(res, { ok: true });
      return;
    }

    if (p === '/api/lavoro' && req.method === 'GET') {
      json(res, {
        lavoro: corrente
          ? {
              comando: corrente.comando,
              configFile: corrente.configFile,
              stato: corrente.stato,
              fatte: corrente.fatte,
              totali: corrente.totali,
              righe: corrente.righe.slice(-400),
              avviatoIl: corrente.avviatoIl,
            }
          : null,
      });
      return;
    }

    /* --- flusso di avanzamento (server-sent events) --- */
    if (p === '/api/eventi') {
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      res.write(': connesso\n\n');
      ascoltatori.add(res);
      const battito = setInterval(() => {
        try {
          res.write(': battito\n\n');
        } catch {
          /* la connessione verra' ripulita alla chiusura */
        }
      }, 20000);
      req.on('close', () => {
        clearInterval(battito);
        ascoltatori.delete(res);
      });
      return;
    }

    /* --- risultati --- */
    if (p === '/api/risultati' && req.method === 'GET') {
      const outDir = url.searchParams.get('outDir') ?? '';
      const run = await leggiRun(outDir);
      if (!run) {
        json(res, { presente: false });
        return;
      }
      const perBanda: Record<string, number> = {};
      const perResponsabile: Record<string, number> = {};
      for (const f of run.findings) {
        const b = f.severity?.band ?? 'n/d';
        perBanda[b] = (perBanda[b] ?? 0) + 1;
        perResponsabile[f.owner] = (perResponsabile[f.owner] ?? 0) + 1;
      }
      json(res, {
        presente: true,
        progetto: run.project,
        versione: run.engineVersion,
        standard: run.standard,
        quando: run.startedAt,
        stats: run.stats,
        qualita: run.quality ?? null,
        perBanda,
        perResponsabile,
        daRivedere: run.findings.filter(
          (f: any) => f.verdict === 'needs-review' && !f.humanReview,
        ).length,
        riviste: run.findings.filter((f: any) => f.humanReview).length,
        dashboard: `${outDir}/dashboard.html`,
        backlog: `${outDir}/backlog.xlsx`,
        haDashboard: await esiste(path.join(DATI, outDir, 'dashboard.html')),
        haBacklog: await esiste(path.join(DATI, outDir, 'backlog.xlsx')),
      });
      return;
    }

    /* --- revisione --- */
    if (p === '/api/revisione' && req.method === 'GET') {
      const outDir = url.searchParams.get('outDir') ?? '';
      const run = await leggiRun(outDir);
      if (!run) {
        json(res, { coda: [] });
        return;
      }
      json(res, { coda: await codaRevisione(run, outDir) });
      return;
    }

    if (p === '/api/revisione' && req.method === 'POST') {
      const b = await corpoJson(req);
      const esiti = ['non-conforme', 'conforme', 'irrilevante', 'da-approfondire'];
      if (!esiti.includes(String(b.esito))) {
        json(res, { errore: 'Esito non riconosciuto.' }, 400);
        return;
      }
      const r = await salvaRevisione(
        String(b.outDir ?? ''),
        String(b.id ?? ''),
        String(b.esito),
        String(b.nota ?? ''),
        String(b.revisore ?? ''),
      );
      json(res, r, r.ok ? 200 : 404);
      return;
    }

    /* --- file prodotti (dashboard, backlog, screenshot) --- */
    if (p.startsWith('/file/')) {
      await serviFile(res, decodeURIComponent(p.slice('/file/'.length)), url.searchParams.get('base'));
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('non trovato');
  } catch (err) {
    json(res, { errore: err instanceof Error ? err.message : String(err) }, 500);
  }
});

server.listen(PORTA, '127.0.0.1', () => {
  const indirizzo = `http://127.0.0.1:${PORTA}`;
  console.log(`\n  Studio accessibilità Hinto`);
  console.log(`  aperto su ${indirizzo}`);
  console.log(`  (per chiudere: Ctrl+C in questa finestra)\n`);
  // Quando lo Studio viene avviato dall'applicazione, e' l'applicazione ad
  // aprire la propria finestra: qui non si apre niente, altrimenti l'utente si
  // ritroverebbe due finestre sullo stesso indirizzo.
  if (process.env.A11Y_STUDIO_NO_OPEN === '1') return;
  // su macOS si apre da solo: e' il passaggio che fa risparmiare la spiegazione
  spawn('open', [indirizzo], { stdio: 'ignore' }).on('error', () => {
    /* su altri sistemi si apre a mano: l'indirizzo e' scritto qui sopra */
  });
});
