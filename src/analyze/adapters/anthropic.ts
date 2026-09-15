/**
 * Adapter API - il trasporto di produzione.
 *
 * E' la dimostrazione che la porta funziona: stessa interfaccia dell'adapter
 * manuale, stesso contratto in ingresso e in uscita. Passare dall'uno all'altro
 * e' un cambio di configurazione, non una riscrittura.
 *
 * Volutamente senza SDK: una sola chiamata fetch, nessuna dipendenza in piu'
 * da tenere aggiornata e nessun vincolo di versione dentro il motore.
 */
import { readFile } from 'node:fs/promises';
import pLimit from 'p-limit';
import type { EvidencePack, TriageAdapter, TriageResult } from '../aiPort.js';
import { TriageResult as TriageResultSchema } from '../aiPort.js';

export interface AnthropicAdapterOptions {
  apiKey: string;
  model: string;
  promptPath: string;
  /** Pacchetti elaborati in parallelo */
  concurrency: number;
  maxTokens: number;
  /** Tentativi in caso di risposta non conforme allo schema */
  maxRetries: number;
}

export const DEFAULT_ANTHROPIC: Omit<AnthropicAdapterOptions, 'apiKey' | 'promptPath'> = {
  model: 'claude-sonnet-4-6',
  concurrency: 3,
  maxTokens: 8000,
  maxRetries: 2,
};

export class AnthropicTriageAdapter implements TriageAdapter {
  readonly name = 'anthropic';

  constructor(private opts: AnthropicAdapterOptions) {}

  async triage(packs: EvidencePack[]): Promise<TriageResult[]> {
    const systemPrompt = await readFile(this.opts.promptPath, 'utf8');
    const limit = pLimit(this.opts.concurrency);
    const results: TriageResult[] = [];

    await Promise.all(
      packs.map((pack) =>
        limit(async () => {
          const res = await this.triageOne(pack, systemPrompt);
          if (res) results.push(res);
        }),
      ),
    );

    return results.sort((a, b) => a.packId.localeCompare(b.packId));
  }

  private async triageOne(
    pack: EvidencePack,
    systemPrompt: string,
  ): Promise<TriageResult | null> {
    let lastError = '';

    for (let attempt = 0; attempt <= this.opts.maxRetries; attempt++) {
      const userContent =
        attempt === 0
          ? `Pacchetto ${pack.packIndex} di ${pack.packTotal}.\n\n${JSON.stringify(pack, null, 2)}`
          : `La risposta precedente non rispettava lo schema (${lastError}). Rispondi di nuovo con SOLO il JSON valido.\n\n${JSON.stringify(pack, null, 2)}`;

      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': this.opts.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: this.opts.model,
            max_tokens: this.opts.maxTokens,
            system: systemPrompt,
            messages: [{ role: 'user', content: userContent }],
          }),
        });

        if (!response.ok) {
          lastError = `HTTP ${response.status}: ${await response.text()}`;
          continue;
        }

        const body = (await response.json()) as {
          content: Array<{ type: string; text?: string }>;
        };
        const text = body.content
          .filter((c) => c.type === 'text')
          .map((c) => c.text ?? '')
          .join('');

        const cleaned = text
          .replace(/^\s*```(?:json)?\s*/i, '')
          .replace(/\s*```\s*$/i, '')
          .trim();

        return TriageResultSchema.parse(JSON.parse(cleaned));
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    console.warn(`  Triage fallito per ${pack.packId}: ${lastError}`);
    return null;
  }
}
