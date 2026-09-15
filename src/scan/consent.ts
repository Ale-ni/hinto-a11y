/**
 * Banner cookie e muri di consenso.
 *
 * Sono il primo ostacolo reale di qualunque scansione su un sito vero. Un
 * banner coperto sopra la pagina falsa tutto: cattura il focus nel percorso
 * da tastiera, copre gli elementi negli screenshot, e riempie il backlog di
 * finding sul banner invece che sul sito. Ignorarli produce un audit inutile.
 *
 * Ma nemmeno chiuderli e basta va bene: il banner e' la PRIMA cosa che
 * incontra un utente, e se non e' accessibile il sito e' inaccessibile a
 * partire dal primo secondo. Anzi, e' spesso il punto piu' critico di tutti,
 * perche' blocca l'accesso a qualunque contenuto.
 *
 * Quindi qui si fa la cosa corretta e non quella comoda:
 *   1. si rileva il banner
 *   2. lo si audita SEPARATAMENTE, marcandolo come componente a se'
 *   3. lo si chiude
 *   4. si prosegue con la scansione del sito vero
 *
 * Cosi' i problemi del banner restano visibili nel report - attribuiti al
 * banner, spesso fornito da terzi - senza inquinare l'audit del sito.
 */
import type { Page } from 'playwright';

/** Selettori forniti dalla configurazione: hanno sempre la precedenza. */
export interface ConsentOverride {
  containerSelector?: string;
  acceptSelector?: string;
}

/**
 * Diagnostica assistita, emessa quando la chiusura fallisce.
 *
 * Serve a non lasciare l'operatore davanti a DevTools: il motore ha gia' il
 * DOM del banner in mano, quindi elenca i candidati cliccabili col loro testo
 * e il loro selettore. Chi rivede copia una riga nella configurazione e la
 * scansione successiva funziona. Trenta secondi invece di mezz'ora.
 */
export interface ConsentDiagnostics {
  containerHtml: string;
  candidates: Array<{ selector: string; text: string; tag: string; visible: boolean }>;
}

export interface ConsentOutcome {
  /** Un banner e' stato rilevato */
  detected: boolean;
  /** Il banner e' stato effettivamente chiuso */
  dismissed: boolean;
  /** Piattaforma riconosciuta, se identificabile */
  platform?: string;
  /** Selettore del contenitore del banner */
  containerSelector?: string;
  /** Come e' stato chiuso: utile per capire se il modo era accessibile */
  method?: string;
  /** Il banner intrappolava il focus della tastiera */
  trapsFocus?: boolean;
  /** Il banner era raggiungibile da tastiera */
  keyboardReachable?: boolean;
  /** Presente solo quando la chiusura e' fallita: aiuta a configurare l'override */
  diagnostics?: ConsentDiagnostics;
}

/**
 * Piattaforme di consenso piu' diffuse in Italia e in Europa.
 * L'ordine conta: si prova prima il riconoscimento specifico, che e'
 * affidabile, e solo dopo l'euristica generica sul testo.
 */
const PLATFORMS: Array<{
  name: string;
  container: string;
  accept: string[];
}> = [
  {
    name: 'Iubenda',
    container: '#iubenda-cs-banner, .iubenda-cs-container',
    accept: ['.iubenda-cs-accept-btn', '#iubenda-cs-accept-btn'],
  },
  {
    name: 'OneTrust',
    container: '#onetrust-banner-sdk, #onetrust-consent-sdk',
    accept: ['#onetrust-accept-btn-handler', '.onetrust-close-btn-handler'],
  },
  {
    name: 'Cookiebot',
    container: '#CybotCookiebotDialog',
    accept: [
      '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
      '#CybotCookiebotDialogBodyButtonAccept',
    ],
  },
  {
    name: 'Usercentrics',
    container: '#usercentrics-root, [data-testid="uc-container"]',
    accept: ['[data-testid="uc-accept-all-button"]'],
  },
  {
    name: 'Complianz',
    container: '#cmplz-cookiebanner-container, .cmplz-cookiebanner',
    accept: ['.cmplz-accept', '.cmplz-btn.cmplz-accept'],
  },
  {
    name: 'CookieYes',
    container: '#cookie-law-info-bar, .cky-consent-container',
    accept: ['#cookie_action_close_header', '.cky-btn-accept'],
  },
  {
    name: 'Borlabs',
    container: '#BorlabsCookieBox, .borlabs-cookie-box',
    accept: ['[data-cookie-accept-all]', '.borlabs-cookie-accept-all'],
  },
  {
    name: 'Cookie Notice (WP)',
    container: '#cookie-notice',
    accept: ['#cn-accept-cookie'],
  },
  {
    name: 'Osano',
    container: '.osano-cm-dialog',
    accept: ['.osano-cm-accept-all', '.osano-cm-accept'],
  },
  {
    name: 'Didomi',
    container: '#didomi-host, .didomi-popup-container',
    accept: ['#didomi-notice-agree-button'],
  },
  {
    name: 'Klaro',
    container: '.klaro .cookie-notice',
    accept: ['.cm-btn-success, .cm-btn-accept-all'],
  },
];

/** Testi di accettazione, italiano e inglese. Ultima risorsa. */
const ACCEPT_TEXT =
  /^(accetta(\s+(tutti|tutto|e chiudi|i cookie|tutti i cookie))?|acconsento|ho capito|va bene|consenti(\s+(tutti|tutto))?|autorizzo|procedi|continua|chiudi|ok,?\s*(ho capito)?|accept(\s+(all|cookies|and close|all cookies))?|allow(\s+all)?|agree|i agree|got it|understood|close|dismiss)[\s.!]*$/i;

/**
 * Contenitori generici: euristica di posizione. Un elemento fisso, ampio e
 * ad alto z-index attaccato a un bordo dello schermo e' quasi sempre un
 * banner di consenso o un muro di iscrizione.
 */
export async function detectAndDismiss(
  page: Page,
  override?: ConsentOverride,
  /**
   * Chiamata con il selettore del banner PRIMA della chiusura. E' il gancio
   * con cui lo scanner audita il banner come componente a se' stante: dopo
   * la chiusura non esiste piu' e non sarebbe piu' verificabile.
   */
  onBeforeDismiss?: (containerSelector: string) => Promise<void>,
): Promise<ConsentOutcome> {
  /* --- 0. override dalla configurazione: ha sempre la precedenza ----------- *
   * Su un sito di un cliente si incontra quasi sempre un banner fatto in casa.
   * Trenta secondi di ispezione valgono piu' di qualunque euristica, e una
   * volta scritto nella configurazione il risultato e' ripetibile.            */
  if (override?.acceptSelector) {
    const container = override.containerSelector
      ? page.locator(override.containerSelector).first()
      : null;
    const outcome: ConsentOutcome = {
      detected: true,
      dismissed: false,
      platform: 'configurata',
      containerSelector: override.containerSelector,
    };
    if (override.containerSelector) {
      outcome.keyboardReachable = await isKeyboardReachable(page, override.containerSelector);
      if (onBeforeDismiss) await onBeforeDismiss(override.containerSelector);
    }
    try {
      const btn = page.locator(override.acceptSelector).first();
      if ((await btn.count()) > 0) {
        await btn.click({ timeout: 5000 });
        await page.waitForTimeout(700);
        outcome.dismissed = container ? !(await container.isVisible().catch(() => false)) : true;
        outcome.method = `selettore da configurazione ${override.acceptSelector}`;
        if (outcome.dismissed) return outcome;
      }
    } catch {
      /* si prosegue con il riconoscimento automatico */
    }
  }

  /* --- 1. riconoscimento per piattaforma --- */
  for (const p of PLATFORMS) {
    const container = page.locator(p.container).first();
    if ((await container.count()) === 0) continue;
    if (!(await container.isVisible().catch(() => false))) continue;

    const outcome: ConsentOutcome = {
      detected: true,
      dismissed: false,
      platform: p.name,
      containerSelector: p.container,
    };

    outcome.keyboardReachable = await isKeyboardReachable(page, p.container);
    if (onBeforeDismiss) await onBeforeDismiss(p.container);

    for (const sel of p.accept) {
      const btn = page.locator(sel).first();
      if ((await btn.count()) === 0) continue;
      try {
        await btn.click({ timeout: 4000 });
        await page.waitForTimeout(600);
        outcome.dismissed = !(await container.isVisible().catch(() => false));
        outcome.method = `pulsante ${sel}`;
        if (outcome.dismissed) return outcome;
      } catch {
        continue;
      }
    }

    // la piattaforma e' nota ma il pulsante non ha funzionato
    const generic = await dismissByText(page);
    if (generic) {
      outcome.dismissed = true;
      outcome.method = generic;
    } else {
      outcome.diagnostics = await collectDiagnostics(page, p.container);
    }
    return outcome;
  }

  /* --- 2. euristica generica --- */
  const heuristic = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('body > *, body > * > *'));
    for (const el of els) {
      const s = getComputedStyle(el);
      if (s.position !== 'fixed' && s.position !== 'sticky') continue;
      if (s.display === 'none' || s.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width < window.innerWidth * 0.5) continue;
      if (r.height < 60) continue;
      const z = Number(s.zIndex) || 0;
      if (z < 10) continue;
      const text = (el.textContent || '').toLowerCase();
      if (!/cookie|consenso|privacy|tracciamento|consent|gdpr/.test(text)) continue;
      const id = el.id ? `#${el.id}` : '';
      const cls = el.className && typeof el.className === 'string'
        ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
        : '';
      return { selector: id || cls || el.tagName.toLowerCase(), zIndex: z };
    }
    return null;
  });

  if (!heuristic) return { detected: false, dismissed: false };

  const outcome: ConsentOutcome = {
    detected: true,
    dismissed: false,
    platform: 'non identificata',
    containerSelector: heuristic.selector,
  };
  outcome.keyboardReachable = await isKeyboardReachable(page, heuristic.selector);
  if (onBeforeDismiss) await onBeforeDismiss(heuristic.selector);

  const method = await dismissByText(page);
  if (method) {
    outcome.dismissed = true;
    outcome.method = method;
  } else {
    outcome.diagnostics = await collectDiagnostics(page, heuristic.selector);
  }
  return outcome;
}

/** Elenca i candidati cliccabili dentro il banner, per l'operatore. */
async function collectDiagnostics(
  page: Page,
  containerSelector: string,
): Promise<ConsentDiagnostics | undefined> {
  try {
    return await page.evaluate((sel) => {
      const H = (window as any).__hinto;
      const container = document.querySelector(sel);
      if (!container) return undefined;
      const nodes = Array.from(
        container.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"], [onclick], [tabindex]'),
      ).slice(0, 25);
      return {
        containerHtml: (container.outerHTML || '').replace(/\s+/g, ' ').slice(0, 1500),
        candidates: nodes.map((el) => {
          const r = el.getBoundingClientRect();
          return {
            selector: H && H.cssPath ? H.cssPath(el) : el.tagName.toLowerCase(),
            text: (
              el.getAttribute('aria-label') ||
              (el as HTMLInputElement).value ||
              el.textContent ||
              ''
            )
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 60),
            tag: el.tagName.toLowerCase(),
            visible: r.width > 0 && r.height > 0,
          };
        }),
      };
    }, containerSelector);
  } catch {
    return undefined;
  }
}

/** Cerca un pulsante di accettazione per testo. */
async function dismissByText(page: Page): Promise<string | null> {
  const clicked = await page.evaluate((pattern) => {
    const re = new RegExp(pattern, 'i');
    // Deliberatamente largo: i banner fatti in casa usano spesso div, span
    // o link con handler JavaScript invece di veri pulsanti.
    const candidates = Array.from(
      document.querySelectorAll(
        'button, a, [role="button"], input[type="button"], input[type="submit"], [onclick], span[tabindex], div[tabindex]',
      ),
    );
    for (const el of candidates) {
      const label = (
        el.getAttribute('aria-label') ||
        (el as HTMLInputElement).value ||
        el.textContent ||
        ''
      )
        .replace(/\s+/g, ' ')
        .trim();
      if (!label || !re.test(label)) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      (el as HTMLElement).click();
      return label;
    }
    return null;
  }, ACCEPT_TEXT.source);

  if (!clicked) return null;
  await page.waitForTimeout(600);
  return `testo "${clicked}"`;
}

/**
 * Il banner e' raggiungibile da tastiera?
 *
 * Controllo STATICO, deliberatamente. La versione precedente premeva Tab
 * dodici volte per vedere se il focus entrava nel banner: funzionava, ma
 * lasciava il punto di partenza della navigazione sequenziale a meta' pagina.
 * Il percorso da tastiera eseguito subito dopo partiva quindi monco - quattro
 * fermate invece di quindici - e si perdeva proprio gli elementi iniziali,
 * compresi quelli con tabindex positivo che il check deve intercettare.
 * Una sonda diagnostica non puo' alterare cio' che verra' misurato dopo.
 *
 * Il limite di questa versione e' dichiarato: rileva i casi che contano nella
 * pratica - pulsanti con tabindex="-1", banner nascosti alle tecnologie
 * assistive con aria-hidden, contenitori inert - ma non dimostra la
 * raggiungibilita' effettiva in presenza di trappole del focus altrove nella
 * pagina. Per quello serve la verifica manuale, che resta in coda di revisione.
 */
async function isKeyboardReachable(page: Page, containerSelector: string): Promise<boolean> {
  try {
    return await page.evaluate((sel) => {
      const container = document.querySelector(sel);
      if (!container) return false;

      // un contenitore nascosto alle tecnologie assistive o inerte non e'
      // operabile, per quanto sia visibile sullo schermo
      let node: Element | null = container;
      while (node) {
        if (node.getAttribute('aria-hidden') === 'true') return false;
        if (node.hasAttribute('inert')) return false;
        node = node.parentElement;
      }

      const focusables = Array.from(
        container.querySelectorAll(
          'a[href], button, input, select, textarea, [tabindex], [role="button"], [contenteditable]',
        ),
      );

      return focusables.some((el) => {
        const ti = el.getAttribute('tabindex');
        if (ti !== null && Number(ti) < 0) return false;       // fuori dall'ordine
        if ((el as HTMLButtonElement).disabled) return false;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return false;
        const s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden') return false;
        return true;
      });
    }, containerSelector);
  } catch {
    return false;
  }
}

/**
 * Scorre la pagina per innescare i contenuti caricati in differita.
 *
 * Senza questo passaggio, su un sito con immagini lazy o animazioni allo
 * scroll il motore auditerebbe una pagina mezza vuota e non se ne
 * accorgerebbe: nessun errore, semplicemente meno contenuto di quello reale.
 * E' un falso negativo silenzioso, il tipo di errore peggiore.
 */
export async function triggerLazyContent(page: Page, maxSteps = 12): Promise<number> {
  const stepped = await page.evaluate(async (steps) => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const startHeight = document.body.scrollHeight;
    let i = 0;
    for (; i < steps; i++) {
      window.scrollTo(0, Math.round((document.body.scrollHeight / steps) * (i + 1)));
      await sleep(180);
      if (window.scrollY + window.innerHeight >= document.body.scrollHeight - 4) {
        i++;
        break;
      }
    }
    window.scrollTo(0, 0);
    await sleep(200);
    return { steps: i, grew: document.body.scrollHeight - startHeight };
  }, maxSteps);

  // le immagini differite possono ancora essere in arrivo
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  return stepped.steps;
}
