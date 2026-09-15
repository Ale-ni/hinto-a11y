/**
 * Generatore di PNG minimi per i siti di prova.
 *
 * Serve perche' i fixture siano autosufficienti: senza immagini vere il
 * browser assegna dimensione zero agli elementi <img>, il filtro di visibilita'
 * li scarta e i check sulle immagini non si attivano mai. Era successo, e il
 * sintomo era muto - nessun errore, semplicemente due check che non giravano.
 */
import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

export function png(width = 120, height = 80, rgb = [200, 205, 215]) {
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array(width).fill(rgb).flat())]);
  const raw = Buffer.concat(Array(height).fill(row));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export async function writeImages(dir, names) {
  await mkdir(dir, { recursive: true });
  const data = png();
  for (const n of names) await writeFile(path.join(dir, n), data);
  return names.length;
}
