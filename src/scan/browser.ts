/**
 * Avvio del browser.
 *
 * In ambienti gestiti (CI, container aziendali, runner con browser
 * preinstallati) la build di Chromium presente spesso non coincide con quella
 * che si aspetta la versione di Playwright installata. Invece di forzare un
 * download - che in rete chiusa fallisce - accettiamo un percorso esplicito.
 *
 * Ordine di precedenza:
 *   1. opzione passata dal chiamante
 *   2. A11Y_CHROMIUM_PATH
 *   3. PLAYWRIGHT_CHROMIUM_EXECUTABLE
 *   4. default di Playwright
 */
import { access } from 'node:fs/promises';
import { chromium, type Browser, type BrowserContext, type BrowserContextOptions } from 'playwright';

/**
 * I transpiler basati su esbuild (tsx, tsup) iniettano un helper `__name` nelle
 * funzioni per preservarne il nome. Quando Playwright serializza una funzione
 * per eseguirla nella pagina, l'helper resta nel codice ma non esiste nel
 * browser: ogni page.evaluate esplode con "__name is not defined".
 *
 * Lo shim va installato su OGNI contesto, prima che la pagina carichi.
 */
const ESBUILD_SHIM = `
if (typeof globalThis.__name === 'undefined') {
  globalThis.__name = function (fn) { return fn; };
}
`;

export async function newContext(
  browser: Browser,
  options: BrowserContextOptions,
): Promise<BrowserContext> {
  const ctx = await browser.newContext(options);
  await ctx.addInitScript(ESBUILD_SHIM);
  return ctx;
}

export async function launchBrowser(
  executablePath?: string,
  opts: { headless?: boolean } = {},
): Promise<Browser> {
  const headless = opts.headless ?? true;
  const candidate =
    executablePath ??
    process.env.A11Y_CHROMIUM_PATH ??
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

  const args = ['--disable-dev-shm-usage', '--no-sandbox'];

  if (candidate) {
    try {
      await access(candidate);
      return await chromium.launch({ headless, executablePath: candidate, args });
    } catch {
      console.warn(
        `  Chromium non trovato in "${candidate}": uso il browser predefinito di Playwright.`,
      );
    }
  }

  return chromium.launch({ headless, args });
}
