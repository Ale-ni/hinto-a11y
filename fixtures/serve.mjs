import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('fixtures/site');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg' };

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let p = path.join(ROOT, decodeURIComponent(url.pathname));
    try {
      const s = await stat(p);
      if (s.isDirectory()) p = path.join(p, 'index.html');
    } catch {
      if (!path.extname(p)) p = path.join(p, 'index.html');
    }
    const buf = await readFile(p);
    res.writeHead(200, { 'content-type': TYPES[path.extname(p)] ?? 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><html lang="it"><head><title>404</title></head><body><h1>Non trovato</h1></body></html>');
  }
}).listen(8099, () => console.log('fixture server su http://localhost:8099'));
