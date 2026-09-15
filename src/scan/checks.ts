/**
 * Check che axe-core non copre.
 *
 * Il principio e' rigido: questi check producono OSSERVAZIONI, non verdetti.
 * Un check puo' dire "questo link si chiama 'leggi tutto' e ne esistono altri
 * 38 uguali che puntano altrove"; non puo' dire "viola il 2.4.4". Il verdetto
 * lo assegna l'analyzer applicando il tetto di `maxAutomatedVerdict`, e per i
 * criteri di giudizio quel tetto e' sempre `needs-review`.
 *
 * E' la differenza fra un report che regge davanti al cliente e uno che si
 * riempie di falsi positivi che il fornitore puo' legittimamente contestare.
 */
import type { Page } from 'playwright';

export interface RawObservation {
  checkId: string;
  criteria: string[];
  selector: string;
  componentSignature: string;
  html: string;
  observation: string;
  data: Record<string, unknown>;
  engineImpact?: 'minor' | 'moderate' | 'serious' | 'critical';
}

/* ------------------------------------------------------------------ *
 * Struttura: heading, landmark, titolo, lingua
 * ------------------------------------------------------------------ */

export async function checkStructure(page: Page): Promise<RawObservation[]> {
  return page.evaluate(() => {
    const H = (window as any).__hinto;
    const out: any[] = [];

    /* --- outline dei heading --- */
    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'))
      .filter((h) => H.isVisible(h))
      .map((h) => ({
        el: h,
        level: Number(h.tagName[1]),
        text: (h.textContent || '').replace(/\s+/g, ' ').trim(),
      }));

    const h1s = headings.filter((h) => h.level === 1);
    if (h1s.length === 0) {
      out.push({
        checkId: 'heading-no-h1',
        criteria: ['1.3.1', '2.4.6'],
        selector: 'body',
        componentSignature: 'document',
        html: '',
        observation: 'La pagina non ha nessun heading di primo livello (h1).',
        data: { headingCount: headings.length },
        engineImpact: 'serious',
      });
    } else if (h1s.length > 1) {
      out.push({
        checkId: 'heading-multiple-h1',
        criteria: ['1.3.1'],
        selector: H.cssPath(h1s[1].el),
        componentSignature: H.componentSignature(h1s[1].el),
        html: H.snippet(h1s[1].el, 200),
        observation: `La pagina ha ${h1s.length} heading di primo livello: "${h1s
          .map((h) => h.text.slice(0, 40))
          .join('", "')}".`,
        data: { count: h1s.length, texts: h1s.map((h) => h.text) },
        engineImpact: 'moderate',
      });
    }

    for (let i = 1; i < headings.length; i++) {
      const jump = headings[i].level - headings[i - 1].level;
      if (jump > 1) {
        out.push({
          checkId: 'heading-skipped-level',
          criteria: ['1.3.1'],
          selector: H.cssPath(headings[i].el),
          componentSignature: H.componentSignature(headings[i].el),
          html: H.snippet(headings[i].el, 200),
          observation: `Salto di livello nella gerarchia: da h${headings[i - 1].level} ("${headings[
            i - 1
          ].text.slice(0, 40)}") direttamente a h${headings[i].level} ("${headings[i].text.slice(0, 40)}").`,
          data: { from: headings[i - 1].level, to: headings[i].level },
          engineImpact: 'moderate',
        });
      }
    }

    const emptyHeadings = headings.filter((h) => !h.text);
    for (const h of emptyHeadings.slice(0, 5)) {
      out.push({
        checkId: 'heading-empty',
        criteria: ['1.3.1', '2.4.6'],
        selector: H.cssPath(h.el),
        componentSignature: H.componentSignature(h.el),
        html: H.snippet(h.el, 200),
        observation: `Heading h${h.level} privo di testo.`,
        data: {},
        engineImpact: 'moderate',
      });
    }

    /* --- landmark --- */
    const mains = document.querySelectorAll('main, [role="main"]');
    if (mains.length === 0) {
      out.push({
        checkId: 'landmark-no-main',
        criteria: ['1.3.1', '2.4.1'],
        selector: 'body',
        componentSignature: 'document',
        html: '',
        observation: 'Nessun landmark <main>: chi usa uno screen reader non puo\' saltare direttamente al contenuto.',
        data: {},
        engineImpact: 'serious',
      });
    } else if (mains.length > 1) {
      out.push({
        checkId: 'landmark-multiple-main',
        criteria: ['1.3.1'],
        selector: H.cssPath(mains[1]),
        componentSignature: H.componentSignature(mains[1]),
        html: H.snippet(mains[1], 200),
        observation: `Sono presenti ${mains.length} landmark main nella stessa pagina.`,
        data: { count: mains.length },
        engineImpact: 'moderate',
      });
    }

    const navs = Array.from(document.querySelectorAll('nav, [role="navigation"]'));
    if (navs.length > 1) {
      const unlabeled = navs.filter(
        (n) => !n.getAttribute('aria-label') && !n.getAttribute('aria-labelledby'),
      );
      if (unlabeled.length) {
        out.push({
          checkId: 'landmark-nav-unlabeled',
          criteria: ['1.3.1', '2.4.6'],
          selector: H.cssPath(unlabeled[0]),
          componentSignature: H.componentSignature(unlabeled[0]),
          html: H.snippet(unlabeled[0], 200),
          observation: `Ci sono ${navs.length} aree di navigazione ma ${unlabeled.length} non hanno un'etichetta che le distingua.`,
          data: { total: navs.length, unlabeled: unlabeled.length },
          engineImpact: 'moderate',
        });
      }
    }

    /* --- titolo della pagina --- */
    const title = (document.title || '').trim();
    if (!title) {
      out.push({
        checkId: 'title-missing',
        criteria: ['2.4.2'],
        selector: 'head > title',
        componentSignature: 'document',
        html: '',
        observation: 'La pagina non ha un titolo.',
        data: {},
        engineImpact: 'serious',
      });
    } else if (title.length < 6) {
      out.push({
        checkId: 'title-too-short',
        criteria: ['2.4.2'],
        selector: 'head > title',
        componentSignature: 'document',
        html: '',
        observation: `Titolo molto corto e probabilmente non descrittivo: "${title}".`,
        data: { title },
        engineImpact: 'minor',
      });
    }

    /* --- skip link --- */
    const firstLinks = Array.from(document.querySelectorAll('a[href^="#"]')).slice(0, 5);
    const hasSkip = firstLinks.some((a) => {
      const t = (a.textContent || '').toLowerCase();
      return /salta|skip|vai al contenuto|contenuto principale/.test(t);
    });
    if (!hasSkip) {
      out.push({
        checkId: 'skiplink-missing',
        criteria: ['2.4.1'],
        selector: 'body',
        componentSignature: 'document',
        html: '',
        observation:
          'Non e\' stato trovato un link "salta al contenuto" fra i primi link della pagina.',
        data: {},
        engineImpact: 'moderate',
      });
    }

    return out;
  });
}

/* ------------------------------------------------------------------ *
 * Inventario immagini
 * ------------------------------------------------------------------ */

export async function checkMedia(page: Page): Promise<RawObservation[]> {
  return page.evaluate(() => {
    const H = (window as any).__hinto;
    const out: any[] = [];
    const imgs = Array.from(document.querySelectorAll('img')).filter((i) => H.isVisible(i));

    for (const img of imgs) {
      const alt = img.getAttribute('alt');
      const src = img.getAttribute('src') || '';
      const filename = src.split('/').pop()?.split('?')[0] || '';
      const sig = H.componentSignature(img);
      const path = H.cssPath(img);
      const snip = H.snippet(img, 250);

      // alt assente e' un fail deterministico: lo prende gia' axe, lo saltiamo
      if (alt === null) continue;

      const altTrim = alt.trim();

      // alt vuoto: corretto SE decorativa, sbagliato se informativa.
      // Non e' decidibile da una macchina -> osservazione per il triage.
      if (altTrim === '') {
        const inLink = img.closest('a,button');
        const linkHasText =
          inLink && (inLink.textContent || '').replace(/\s+/g, ' ').trim().length > 0;
        if (inLink && !linkHasText) {
          out.push({
            checkId: 'img-empty-alt-in-link',
            criteria: ['1.1.1', '2.4.4'],
            selector: path,
            componentSignature: sig,
            html: snip,
            observation:
              'Immagine con alt vuoto usata come unico contenuto di un link: il link risulta senza nome accessibile.',
            data: { src, alt },
            engineImpact: 'critical',
          });
        } else {
          out.push({
            checkId: 'img-empty-alt-review',
            criteria: ['1.1.1'],
            selector: path,
            componentSignature: sig,
            html: snip,
            observation:
              'Immagine con alt vuoto (dichiarata decorativa). Da confermare che non veicoli informazione.',
            data: { src, alt, decorativeClaim: true },
            engineImpact: 'minor',
          });
        }
        continue;
      }

      // alt che ripete il nome del file: quasi sempre generato in automatico
      const altNorm = altTrim.toLowerCase().replace(/[_\-.]/g, ' ');
      const fileNorm = filename.toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[_\-.]/g, ' ');
      if (fileNorm && altNorm === fileNorm) {
        out.push({
          checkId: 'img-alt-is-filename',
          criteria: ['1.1.1'],
          selector: path,
          componentSignature: sig,
          html: snip,
          observation: `Il testo alternativo coincide con il nome del file ("${altTrim}"): non descrive il contenuto.`,
          data: { src, alt: altTrim, filename },
          engineImpact: 'serious',
        });
        continue;
      }

      // alt segnaposto
      if (/^(immagine|image|img|foto|photo|picture|logo|icona|icon|banner|grafica)\s*\d*$/i.test(altTrim)) {
        out.push({
          checkId: 'img-alt-placeholder',
          criteria: ['1.1.1'],
          selector: path,
          componentSignature: sig,
          html: snip,
          observation: `Testo alternativo generico e non informativo: "${altTrim}".`,
          data: { src, alt: altTrim },
          engineImpact: 'serious',
        });
        continue;
      }

      if (altTrim.length > 200) {
        out.push({
          checkId: 'img-alt-too-long',
          criteria: ['1.1.1'],
          selector: path,
          componentSignature: sig,
          html: snip,
          observation: `Testo alternativo di ${altTrim.length} caratteri: probabilmente andrebbe spostato nel contenuto o in una descrizione estesa.`,
          data: { src, altLength: altTrim.length, alt: altTrim.slice(0, 120) },
          engineImpact: 'minor',
        });
      }

      // alt che duplica la didascalia adiacente: ridondanza fastidiosa allo screen reader
      const fig = img.closest('figure');
      if (fig) {
        const cap = fig.querySelector('figcaption');
        if (cap) {
          const capText = (cap.textContent || '').replace(/\s+/g, ' ').trim();
          if (capText && capText.toLowerCase() === altTrim.toLowerCase()) {
            out.push({
              checkId: 'img-alt-duplicates-caption',
              criteria: ['1.1.1'],
              selector: path,
              componentSignature: sig,
              html: snip,
              observation: 'Il testo alternativo ripete parola per parola la didascalia: viene letto due volte.',
              data: { alt: altTrim },
              engineImpact: 'minor',
            });
          }
        }
      }
    }

    // immagini di sfondo con testo: candidate a 1.4.5, non decidibile da macchina
    const bgWithText = Array.from(document.querySelectorAll('*'))
      .filter((el) => {
        if (!H.isVisible(el)) return false;
        const bg = getComputedStyle(el).backgroundImage;
        if (!bg || bg === 'none') return false;
        const r = el.getBoundingClientRect();
        return r.width > 200 && r.height > 80;
      })
      .slice(0, 5);
    for (const el of bgWithText) {
      out.push({
        checkId: 'bg-image-review',
        criteria: ['1.1.1', '1.4.5'],
        selector: H.cssPath(el),
        componentSignature: H.componentSignature(el),
        html: H.snippet(el, 200),
        observation:
          'Immagine di sfondo di dimensioni rilevanti: se contiene testo o informazione, non e\' accessibile.',
        data: { backgroundImage: getComputedStyle(el).backgroundImage.slice(0, 160) },
        engineImpact: 'minor',
      });
    }

    return out;
  });
}

/* ------------------------------------------------------------------ *
 * Inventario link
 * ------------------------------------------------------------------ */

export async function checkLinks(page: Page): Promise<RawObservation[]> {
  return page.evaluate(() => {
    const H = (window as any).__hinto;
    const out: any[] = [];
    const links = Array.from(document.querySelectorAll('a[href]')).filter((a) => H.isVisible(a));

    const GENERIC =
      /^(leggi (tutto|di piu.?|l.articolo)|continua|clicca (qui|qua)|qui|qua|questo link|link|scopri( di piu.?)?|vai|dettagli|approfondisci|read more|more|click here|here|download|scarica)[\s.!:]*$/i;

    const byText = new Map<string, Set<string>>();

    for (const a of links) {
      const text = H.accName(a).replace(/\s+/g, ' ').trim();
      const href = (a as HTMLAnchorElement).href;

      if (text) {
        const key = text.toLowerCase();
        if (!byText.has(key)) byText.set(key, new Set());
        byText.get(key)!.add(href);
      }

      if (text && GENERIC.test(text)) {
        out.push({
          checkId: 'link-generic-text',
          criteria: ['2.4.4'],
          selector: H.cssPath(a),
          componentSignature: H.componentSignature(a),
          html: H.snippet(a, 200),
          observation: `Link con testo generico "${text}": fuori contesto non si capisce dove porta.`,
          data: { text, href },
          engineImpact: 'moderate',
        });
      }

      // nuova finestra senza preavviso
      if ((a as HTMLAnchorElement).target === '_blank') {
        const hasWarning =
          /nuova finestra|nuova scheda|new window|new tab|si apre in/i.test(
            text + ' ' + (a.getAttribute('title') || '') + ' ' + (a.getAttribute('aria-label') || ''),
          );
        if (!hasWarning) {
          out.push({
            checkId: 'link-new-window-unannounced',
            criteria: ['3.2.1', '2.4.4'],
            selector: H.cssPath(a),
            componentSignature: H.componentSignature(a),
            html: H.snippet(a, 200),
            observation: `Il link "${text.slice(0, 60)}" apre una nuova finestra senza avvisare.`,
            data: { text, href },
            engineImpact: 'minor',
          });
        }
      }

      // link il cui nome accessibile e' l'URL grezza
      if (text && /^https?:\/\//i.test(text) && text.length > 40) {
        out.push({
          checkId: 'link-raw-url-text',
          criteria: ['2.4.4'],
          selector: H.cssPath(a),
          componentSignature: H.componentSignature(a),
          html: H.snippet(a, 200),
          observation: 'Il testo del link e\' un URL completo: lo screen reader lo legge carattere per carattere.',
          data: { text: text.slice(0, 120), href },
          engineImpact: 'minor',
        });
      }
    }

    // stesso testo, destinazioni diverse: classico 2.4.4 nei listing
    for (const [text, hrefs] of byText) {
      if (hrefs.size > 1 && text.length < 60) {
        out.push({
          checkId: 'link-same-text-different-targets',
          criteria: ['2.4.4'],
          selector: 'a',
          componentSignature: 'document',
          html: '',
          observation: `Il testo "${text}" e' usato da ${hrefs.size} link che puntano a destinazioni diverse.`,
          data: { text, targetCount: hrefs.size, samples: [...hrefs].slice(0, 5) },
          engineImpact: 'moderate',
        });
      }
    }

    return out;
  });
}

/* ------------------------------------------------------------------ *
 * Form
 * ------------------------------------------------------------------ */

export async function checkForms(page: Page): Promise<RawObservation[]> {
  return page.evaluate(() => {
    const H = (window as any).__hinto;
    const out: any[] = [];
    const fields = Array.from(
      document.querySelectorAll('input:not([type="hidden"]), select, textarea'),
    ).filter((f) => H.isVisible(f));

    const AUTOCOMPLETE_HINTS: Record<string, string> = {
      email: 'email',
      tel: 'tel',
      phone: 'tel',
      telefono: 'tel',
      nome: 'given-name',
      cognome: 'family-name',
      name: 'name',
      indirizzo: 'street-address',
      address: 'street-address',
      cap: 'postal-code',
      citta: 'address-level2',
      password: 'current-password',
    };

    for (const f of fields) {
      const el = f as HTMLInputElement;
      const sig = H.componentSignature(el);
      const path = H.cssPath(el);
      const snip = H.snippet(el, 200);
      const name = H.accName(el);
      const placeholder = el.getAttribute('placeholder') || '';

      // placeholder usato come etichetta: sparisce appena si scrive
      if (!name && placeholder) {
        out.push({
          checkId: 'form-placeholder-as-label',
          criteria: ['3.3.2', '4.1.2'],
          selector: path,
          componentSignature: sig,
          html: snip,
          observation: `Campo senza etichetta, identificato solo dal placeholder "${placeholder}". Il placeholder sparisce durante la digitazione e molti screen reader non lo leggono.`,
          data: { placeholder, type: el.type },
          engineImpact: 'serious',
        });
      }

      // required senza indicazione testuale
      const isRequired = el.hasAttribute('required') || el.getAttribute('aria-required') === 'true';
      if (isRequired && name && !/\*|obbligatorio|required/i.test(name)) {
        out.push({
          checkId: 'form-required-not-indicated',
          criteria: ['3.3.2'],
          selector: path,
          componentSignature: sig,
          html: snip,
          observation: `Il campo "${name}" e' obbligatorio ma l'etichetta non lo dichiara.`,
          data: { label: name },
          engineImpact: 'minor',
        });
      }

      // autocomplete mancante su campi di dati personali (1.3.5, AA)
      const hay = `${el.getAttribute('name') || ''} ${el.id} ${name} ${placeholder}`.toLowerCase();
      if (!el.getAttribute('autocomplete') && el.tagName === 'INPUT') {
        for (const [hint, value] of Object.entries(AUTOCOMPLETE_HINTS)) {
          if (hay.includes(hint)) {
            out.push({
              checkId: 'form-missing-autocomplete',
              criteria: ['1.3.5'],
              selector: path,
              componentSignature: sig,
              html: snip,
              observation: `Campo che raccoglie un dato personale senza attributo autocomplete (atteso: "${value}").`,
              data: { suggested: value, fieldName: el.getAttribute('name') },
              engineImpact: 'moderate',
            });
            break;
          }
        }
      }

      // fieldset mancante su gruppi di radio
      if (el.type === 'radio' && el.name) {
        const group = document.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`);
        if (group.length > 1 && !el.closest('fieldset')) {
          const already = out.some(
            (o) => o.checkId === 'form-radiogroup-no-fieldset' && o.data.group === el.name,
          );
          if (!already) {
            out.push({
              checkId: 'form-radiogroup-no-fieldset',
              criteria: ['1.3.1', '3.3.2'],
              selector: path,
              componentSignature: sig,
              html: snip,
              observation: `Gruppo di ${group.length} radio button senza fieldset/legend: manca la domanda a cui rispondono.`,
              data: { group: el.name, count: group.length },
              engineImpact: 'moderate',
            });
          }
        }
      }
    }

    // campo di ricerca senza submit accessibile
    const searchInputs = Array.from(document.querySelectorAll('input[type="search"]'));
    for (const s of searchInputs) {
      const form = s.closest('form');
      if (form && !form.querySelector('button, input[type="submit"]')) {
        out.push({
          checkId: 'form-search-no-submit',
          criteria: ['2.1.1'],
          selector: H.cssPath(s),
          componentSignature: H.componentSignature(s),
          html: H.snippet(form, 250),
          observation: 'Form di ricerca senza pulsante di invio: da tastiera resta utilizzabile solo con Invio, senza indicazione.',
          data: {},
          engineImpact: 'moderate',
        });
      }
    }

    return out;
  });
}

/* ------------------------------------------------------------------ *
 * Contrasto sugli stati (axe guarda solo lo stato di riposo)
 * ------------------------------------------------------------------ */

export async function checkContrastStates(page: Page): Promise<RawObservation[]> {
  const candidates = await page.evaluate(() => {
    const H = (window as any).__hinto;
    return Array.from(document.querySelectorAll('a[href], button, [role="button"], input[type="submit"]'))
      .filter((el) => H.isVisible(el))
      .slice(0, 40)
      .map((el) => ({ selector: H.cssPath(el), sig: H.componentSignature(el) }))
      .filter((x) => x.selector);
  });

  const out: RawObservation[] = [];
  const seenSignatures = new Set<string>();

  for (const cand of candidates) {
    // un componente per firma: gli altri sono cloni, misurarli tutti e' sprecato
    if (seenSignatures.has(cand.sig)) continue;
    seenSignatures.add(cand.sig);
    if (seenSignatures.size > 12) break;

    try {
      const locator = page.locator(cand.selector).first();
      if ((await locator.count()) === 0) continue;

      const rest = await locator.evaluate((el) => {
        const H = (window as any).__hinto;
        const s = getComputedStyle(el);
        const c = H.contrast(s.color, el);
        // Se dietro al testo c'e' un'immagine o un gradiente, la misura del
        // colore di sfondo non e' attendibile: il confronto va saltato.
        let node: Element | null = el;
        let painted = false;
        for (let i = 0; node && i < 4; i++) {
          const bs = getComputedStyle(node);
          if ((bs.backgroundImage && bs.backgroundImage !== 'none') || bs.backdropFilter !== 'none') {
            painted = true;
            break;
          }
          node = node.parentElement;
        }
        return {
          ratio: c ? c.ratio : null,
          color: s.color,
          fontSize: parseFloat(s.fontSize),
          fontWeight: s.fontWeight,
          painted,
        };
      });

      // Un rapporto a riposo vicino a 1:1 significa che la misura e' fallita
      // (testo e sfondo risultano identici), non che il contrasto sia pessimo.
      if (rest.painted || rest.ratio === null || rest.ratio < 1.05) continue;

      await locator.hover({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(120);
      const hover = await locator.evaluate((el) => {
        const H = (window as any).__hinto;
        const s = getComputedStyle(el);
        const c = H.contrast(s.color, el);
        return { ratio: c ? c.ratio : null, color: s.color };
      });

      const large = rest.fontSize >= 24 || (rest.fontSize >= 18.66 && Number(rest.fontWeight) >= 700);
      const threshold = large ? 3 : 4.5;

      if (hover.ratio !== null && hover.ratio < threshold && hover.color !== rest.color) {
        out.push({
          checkId: 'contrast-hover-insufficient',
          criteria: ['1.4.3'],
          selector: cand.selector,
          componentSignature: cand.sig,
          html: '',
          observation: `In stato hover il contrasto scende a ${hover.ratio}:1 (soglia ${threshold}:1). A riposo era ${rest.ratio}:1.`,
          data: { restRatio: rest.ratio, hoverRatio: hover.ratio, threshold, restColor: rest.color, hoverColor: hover.color },
          engineImpact: 'serious',
        });
      }
    } catch {
      continue;
    }
  }

  return out;
}

/* ------------------------------------------------------------------ *
 * Reflow a 320px e zoom 200%
 * ------------------------------------------------------------------ */

export async function checkReflow(page: Page): Promise<RawObservation[]> {
  const original = page.viewportSize() ?? { width: 1366, height: 900 };
  const out: RawObservation[] = [];

  try {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.waitForTimeout(500);

    const reflow = await page.evaluate(() => {
      const H = (window as any).__hinto;
      const docWidth = Math.max(
        document.documentElement.scrollWidth,
        document.body ? document.body.scrollWidth : 0,
      );
      const viewport = window.innerWidth;
      const overflow = docWidth - viewport;

      const offenders: any[] = [];
      if (overflow > 2) {
        for (const el of Array.from(document.querySelectorAll('body *'))) {
          if (!H.isVisible(el)) continue;
          const r = el.getBoundingClientRect();
          if (r.right > viewport + 2 && r.width > 40) {
            // riporta solo il contenitore piu' esterno che sfora
            const parent = el.parentElement;
            if (parent) {
              const pr = parent.getBoundingClientRect();
              if (pr.right > viewport + 2) continue;
            }
            offenders.push({
              selector: H.cssPath(el),
              sig: H.componentSignature(el),
              html: H.snippet(el, 200),
              right: Math.round(r.right),
              width: Math.round(r.width),
              tag: el.tagName.toLowerCase(),
            });
            if (offenders.length >= 6) break;
          }
        }
      }
      return { docWidth, viewport, overflow, offenders };
    });

    if (reflow.overflow > 2) {
      if (reflow.offenders.length === 0) {
        out.push({
          checkId: 'reflow-horizontal-scroll',
          criteria: ['1.4.10'],
          selector: 'body',
          componentSignature: 'document',
          html: '',
          observation: `A 320px la pagina richiede scorrimento orizzontale: larghezza del documento ${reflow.docWidth}px contro ${reflow.viewport}px di viewport.`,
          data: { overflowPx: reflow.overflow },
          engineImpact: 'serious',
        });
      }
      for (const o of reflow.offenders) {
        out.push({
          checkId: 'reflow-overflowing-element',
          criteria: ['1.4.10'],
          selector: o.selector,
          componentSignature: o.sig,
          html: o.html,
          observation: `A 320px l'elemento <${o.tag}> sfora il viewport di ${o.right - reflow.viewport}px e provoca scorrimento orizzontale.`,
          data: { overflowPx: o.right - reflow.viewport, elementWidth: o.width },
          engineImpact: 'serious',
        });
      }
    }

    /* --- spaziatura del testo (1.4.12) --- */
    await page.setViewportSize(original);
    await page.waitForTimeout(200);
    const spacing = await page.evaluate(() => {
      const H = (window as any).__hinto;

      /**
       * Cerchiamo i CONTENITORI che tagliano, non gli elementi di testo.
       * Il ritaglio quasi sempre nasce da un wrapper con altezza fissa e
       * overflow nascosto: il paragrafo dentro non ha overflow proprio, quindi
       * partire dai paragrafi non trova nulla.
       */
      const candidates = Array.from(document.querySelectorAll('body *')).filter((el) => {
        if (!H.isVisible(el)) return false;
        const s = getComputedStyle(el);
        const hidesY = s.overflow === 'hidden' || s.overflowY === 'hidden' || s.overflow === 'clip';
        if (!hidesY) return false;
        // deve contenere testo proprio, altrimenti non c'e' nulla da tagliare
        return (el.textContent || '').trim().length > 20;
      });

      const style = document.createElement('style');
      style.id = '__hinto_spacing';
      style.textContent =
        '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }';
      document.head.appendChild(style);

      const clipped: any[] = [];
      for (const el of candidates) {
        const node = el as HTMLElement;
        if (node.scrollHeight > node.clientHeight + 4) {
          clipped.push({
            selector: H.cssPath(node),
            sig: H.componentSignature(node),
            html: H.snippet(node, 200),
            scrollHeight: node.scrollHeight,
            clientHeight: node.clientHeight,
          });
        }
        if (clipped.length >= 5) break;
      }
      style.remove();
      return clipped;
    });

    for (const c of spacing) {
      out.push({
        checkId: 'text-spacing-clipped',
        criteria: ['1.4.12'],
        selector: c.selector,
        componentSignature: c.sig,
        html: c.html,
        observation: `Aumentando interlinea e spaziatura come previsto dal criterio, il testo viene tagliato (contenuto ${c.scrollHeight}px in un box di ${c.clientHeight}px con overflow nascosto).`,
        data: { scrollHeight: c.scrollHeight, clientHeight: c.clientHeight },
        engineImpact: 'moderate',
      });
    }
  } finally {
    await page.setViewportSize(original).catch(() => {});
  }

  return out;
}

/* ------------------------------------------------------------------ *
 * Percorso da tastiera
 * ------------------------------------------------------------------ */

export interface KeyboardWalkResult {
  observations: RawObservation[];
  /** Percorso di tabulazione, utile nel report e nel pacchetto per il triage */
  tabOrder: Array<{ index: number; selector: string; label: string; component: string }>;
}

export async function checkKeyboard(page: Page, maxTabs = 60): Promise<KeyboardWalkResult> {
  const out: RawObservation[] = [];
  const tabOrder: KeyboardWalkResult['tabOrder'] = [];

  /**
   * Riporta il focus all'inizio del documento.
   *
   * ATTENZIONE: non si puo' fare mettendo tabindex="-1" sul body e
   * focalizzandolo. Cosi' facendo il body diventa la posizione corrente della
   * navigazione sequenziale, e Chromium salta tutti gli elementi con tabindex
   * POSITIVO - che nell'ordine reale vengono per primi. Il risultato e' un
   * percorso da tastiera plausibile ma sbagliato, che manca proprio gli
   * elementi che il check deve intercettare. Un blur semplice invece riporta
   * la navigazione all'inizio del documento senza alterarne l'ordine.
   */
  await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (el && el !== document.body && typeof el.blur === 'function') el.blur();
  });

  const seen = new Map<string, number>();
  let previousBottom = -Infinity;
  let outOfOrderCount = 0;

  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const H = (window as any).__hinto;
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return {
        selector: H.cssPath(el),
        component: H.componentSignature(el),
        label: H.accName(el),
        tag: el.tagName.toLowerCase(),
        html: H.snippet(el, 200),
        rect: { top: r.top + window.scrollY, left: r.left + window.scrollX, width: r.width, height: r.height },
        visible: H.isVisible(el),
        inViewport: r.top >= -2 && r.bottom <= window.innerHeight + 2,
        outline: { style: s.outlineStyle, width: s.outlineWidth, color: s.outlineColor },
        boxShadow: s.boxShadow,
        tabindex: el.getAttribute('tabindex'),
      };
    });

    if (!info) break;

    tabOrder.push({ index: i, selector: info.selector, label: info.label, component: info.component });

    // trappola: lo stesso elemento riceve il focus troppe volte di fila
    const count = (seen.get(info.selector) ?? 0) + 1;
    seen.set(info.selector, count);
    if (count > 3) {
      out.push({
        checkId: 'keyboard-trap-suspected',
        criteria: ['2.1.2'],
        selector: info.selector,
        componentSignature: info.component,
        html: info.html,
        observation: `Premendo Tab il focus torna ripetutamente sullo stesso elemento (${count} volte): sospetta trappola da tastiera.`,
        data: { repeats: count, label: info.label },
        engineImpact: 'critical',
      });
      break;
    }

    // elemento focalizzabile ma invisibile: focus che "sparisce"
    if (!info.visible) {
      out.push({
        checkId: 'keyboard-focus-on-hidden',
        criteria: ['2.4.3', '2.4.7'],
        selector: info.selector,
        componentSignature: info.component,
        html: info.html,
        observation: `Il focus finisce su un elemento non visibile (<${info.tag}>): l'utente da tastiera non sa dove si trova.`,
        data: { label: info.label },
        engineImpact: 'serious',
      });
    }

    // focus visibile: outline rimosso senza sostituto
    const noOutline =
      info.outline.style === 'none' || parseFloat(info.outline.width) === 0;
    const noShadow = !info.boxShadow || info.boxShadow === 'none';
    if (info.visible && noOutline && noShadow) {
      out.push({
        checkId: 'focus-not-visible',
        criteria: ['2.4.7'],
        selector: info.selector,
        componentSignature: info.component,
        html: info.html,
        observation: `Elemento focalizzabile (<${info.tag}> "${info.label.slice(0, 40)}") senza alcun indicatore di focus visibile: outline rimosso e nessun sostituto.`,
        data: { outline: info.outline, boxShadow: info.boxShadow },
        engineImpact: 'serious',
      });
    }

    // tabindex positivo: rompe l'ordine naturale
    if (info.tabindex && Number(info.tabindex) > 0) {
      out.push({
        checkId: 'keyboard-positive-tabindex',
        criteria: ['2.4.3'],
        selector: info.selector,
        componentSignature: info.component,
        html: info.html,
        observation: `tabindex="${info.tabindex}" forza l'ordine di tabulazione e lo disallinea da quello del documento.`,
        data: { tabindex: info.tabindex },
        engineImpact: 'moderate',
      });
    }

    // salti all'indietro nel layout: indizio di ordine di focus illogico
    if (info.rect.top < previousBottom - 80) outOfOrderCount++;
    previousBottom = info.rect.top;
  }

  if (outOfOrderCount >= 3) {
    out.push({
      checkId: 'focus-order-suspicious',
      criteria: ['2.4.3', '1.3.2'],
      selector: 'body',
      componentSignature: 'document',
      html: '',
      observation: `Durante la tabulazione il focus risale nel layout ${outOfOrderCount} volte: l'ordine potrebbe non seguire la logica visiva. Da verificare manualmente.`,
      data: { backwardJumps: outOfOrderCount, tabStops: tabOrder.length },
      engineImpact: 'moderate',
    });
  }

  if (tabOrder.length === 0) {
    out.push({
      checkId: 'keyboard-no-focusable',
      criteria: ['2.1.1'],
      selector: 'body',
      componentSignature: 'document',
      html: '',
      observation: 'Nessun elemento ha ricevuto il focus premendo Tab: la pagina potrebbe non essere navigabile da tastiera.',
      data: {},
      engineImpact: 'critical',
    });
  }

  return { observations: out, tabOrder };
}
