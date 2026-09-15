/**
 * Adapter manuale - il trasporto del POC.
 *
 * Scrive su disco i pacchetti e il prompt gia' pronti da incollare, e rilegge
 * le risposte. Volutamente identico all'adapter API dal punto di vista della
 * pipeline: stessa interfaccia, stesso contratto, stessa validazione.
 *
 * Non e' un ripiego. In fase di calibrazione vuoi LEGGERE prompt e risposte:
 * un prompt che non guardi mai non lo puoi migliorare. Quando i testi sono
 * stabili, si cambia una riga di configurazione e il trasporto diventa l'API.
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { EvidencePack, TriageAdapter, TriageResult } from '../aiPort.js';
import { TriageResult as TriageResultSchema } from '../aiPort.js';

export interface ManualAdapterOptions {
  /** Cartella dove finiscono i pacchetti da sottoporre al modello */
  inboxDir: string;
  /** Cartella dove l'operatore salva le risposte JSON */
  outboxDir: string;
  /** Percorso del prompt di sistema */
  promptPath: string;
}

export class ManualTriageAdapter implements TriageAdapter {
  readonly name = 'manual';

  constructor(private opts: ManualAdapterOptions) {}

  async triage(packs: EvidencePack[]): Promise<TriageResult[]> {
    await mkdir(this.opts.inboxDir, { recursive: true });
    await mkdir(this.opts.outboxDir, { recursive: true });

    const prompt = await readFile(this.opts.promptPath, 'utf8').catch(
      () => '(prompt non trovato: vedi prompts/triage.it.md)',
    );

    // 1. scrive i pacchetti, uno per file, gia' impaginati per essere incollati
    for (const pack of packs) {
      const jsonPath = path.join(this.opts.inboxDir, `${pack.packId}.json`);
      await writeFile(jsonPath, JSON.stringify(pack, null, 2), 'utf8');

      const ready = [
        prompt,
        '',
        '---',
        '',
        `## Pacchetto ${pack.packIndex} di ${pack.packTotal} - progetto: ${pack.project}`,
        `Standard di riferimento: ${pack.standard}`,
        '',
        '```json',
        JSON.stringify(pack, null, 2),
        '```',
      ].join('\n');
      await writeFile(path.join(this.opts.inboxDir, `${pack.packId}.prompt.md`), ready, 'utf8');
    }

    // 2. rilegge le risposte gia' presenti
    const files = await readdir(this.opts.outboxDir).catch(() => [] as string[]);
    const results: TriageResult[] = [];
    const errors: string[] = [];

    for (const f of files.filter((f) => f.endsWith('.json'))) {
      const raw = await readFile(path.join(this.opts.outboxDir, f), 'utf8');
      try {
        // tolleranza: capita di incollare la risposta dentro un blocco markdown
        const cleaned = raw
          .replace(/^\s*```(?:json)?\s*/i, '')
          .replace(/\s*```\s*$/i, '')
          .trim();
        const parsed = TriageResultSchema.parse(JSON.parse(cleaned));
        results.push(parsed);
      } catch (err) {
        errors.push(`${f}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (errors.length) {
      console.warn(`\n  Risposte di triage non valide e ignorate:`);
      for (const e of errors) console.warn(`   - ${e}`);
    }

    return results;
  }
}
