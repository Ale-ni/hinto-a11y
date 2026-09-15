/**
 * Helper iniettati nella pagina.
 *
 * Vivono come stringa perche' girano nel contesto del browser, non in Node.
 * Li inietta lo scanner una volta per pagina; tutti i check li riusano.
 *
 * La funzione piu' importante e' `componentSignature`: e' la chiave su cui
 * il motore deduplica. Due difetti identici sullo stesso componente, anche
 * su siti diversi, devono produrre la stessa firma - altrimenti il backlog
 * torna a essere un elenco di occorrenze invece che di problemi.
 */
export const INJECTED_HELPERS = `
(() => {
  if (window.__hinto) return;

  const VOLATILE = /(^|-)(\\d{2,}|[0-9a-f]{8,}|active|open|current|selected|hover|focus|visible|hidden|loaded|js-)/i;
  const GENERATED_PREFIX = /^(sc-[a-z0-9]{4,}|css-[a-z0-9]{4,}|emotion-|jsx-\\d+|svelte-[a-z0-9]{5,}|v-[0-9a-f]{6,})/i;

  /** Aspetto tipico di un hash CSS-in-JS: niente separatori, caso misto, breve. */
  function looksGenerated(cls) {
    return GENERATED_PREFIX.test(cls);
  }

  /**
   * Il registro delle classi ricorrenti viene calcolato in Node dopo aver
   * sondato piu' pagine, e iniettato qui. Se manca (prima sonda), si ripiega
   * sul solo filtro sintattico.
   */
  function stableClass(c) {
    if (!c || c.length > 40) return false;
    if (VOLATILE.test(c)) return false;
    // Il registro e' calcolato in Node osservando la frequenza fra pagine ed
    // e' AUTORITATIVO: se c'e', decide da solo. Il filtro sintattico serve
    // solo alla primissima sonda, quando il registro non esiste ancora.
    const reg = window.__hintoStable;
    if (reg && reg.size > 0) return reg.has(c);
    return !looksGenerated(c);
  }

  /** Un id generato (React useId, hash di build) non identifica nulla. */
  function usableId(id) {
    if (!id) return false;
    if (id.indexOf(':') >= 0) return false;      // React useId: ":r0:"
    if (VOLATILE.test(id)) return false;
    if (looksGenerated(id)) return false;
    return true;
  }

  const LANDMARKS = 'header,nav,main,aside,footer,form,[role="banner"],[role="navigation"],[role="main"],[role="complementary"],[role="contentinfo"],[role="search"]';

  /**
   * Componenti di terze parti.
   *
   * Sul primo sito reale il finding piu' grave dell'intero rapporto - focus
   * non visibile, 629 occorrenze stimate - era interamente il badge reCAPTCHA
   * di Google. Non era codice del cliente. Consegnare un rapporto che fattura
   * la segnalazione di un iframe di Google e' il modo piu' rapido di perdere
   * credibilita' davanti al fornitore che deve correggere.
   *
   * Questi problemi restano nel rapporto - l'utente li incontra davvero, e la
   * responsabilita' verso di lui resta di chi pubblica il sito - ma vanno
   * attribuiti al fornitore giusto e tenuti in una sezione propria.
   */
  const VENDORS = [
    ['reCAPTCHA', '.grecaptcha-badge,#g-recaptcha,iframe[src*="recaptcha"],div[class*="grecaptcha"]'],
    ['UserWay', '#userwayAccessibilityIcon,[class*="userway"],[id*="userway"],iframe[src*="userway"]'],
    ['AccessiBe', '#acsb-widget,.acsb-trigger,[class*="accessibe"]'],
    ['Cookiebot', '#CybotCookiebotDialog'],
    // La mappa incorporata via JS API non e' un iframe: e' un albero di div
    // generati da Google dentro la pagina (.gm-style, gmp-internal-*). Senza
    // questi selettori i suoi difetti - pulsanti senza nome, immagini senza
    // alternativa - finivano attribuiti al front-end del cliente.
    ['Google Maps', 'iframe[src*="google.com/maps"],iframe[src*="maps.google"],.gm-style,[class^="gm-"],gmp-map,[class*="gmp-internal"]'],
    ['YouTube', 'iframe[src*="youtube.com"],iframe[src*="youtube-nocookie"],iframe[src*="youtu.be"]'],
    ['Vimeo', 'iframe[src*="player.vimeo"]'],
    ['HubSpot', '#hubspot-messages-iframe-container,.hs-form,[class*="hbspt"]'],
    ['Intercom', '.intercom-lightweight-app,#intercom-container,[class*="intercom-"]'],
    ['Drift', '#drift-widget,[class*="drift-frame"]'],
    ['Tawk.to', '#tawkchat-container,iframe[src*="tawk.to"]'],
    ['Crisp', '#crisp-chatbox,[class*="crisp-client"]'],
    ['Calendly', '.calendly-inline-widget,iframe[src*="calendly"]'],
    ['Typeform', '[data-tf-widget],iframe[src*="typeform"]'],
    ['Trustpilot', '.trustpilot-widget,iframe[src*="trustpilot"]'],
    ['Google Tag Manager', 'iframe[src*="googletagmanager"]']
  ];

  /** Restituisce il nome del fornitore se l'elemento appartiene a un componente di terze parti. */
  function vendorOf(el) {
    if (!el || !el.closest) return '';
    for (let i = 0; i < VENDORS.length; i++) {
      try {
        if (el.closest(VENDORS[i][1])) return VENDORS[i][0];
      } catch (e) { /* selettore non supportato: si prosegue */ }
    }
    return '';
  }
  const TEST_ATTRS = ['data-testid', 'data-test-id', 'data-cy', 'data-component', 'data-qa', 'data-block'];

  function esc(s) {
    try { return CSS.escape(s); } catch (e) { return s; }
  }

  /** Descrittore di un singolo elemento, con catena di ripiego. */
  function descriptor(node, opts) {
    const tag = node.tagName.toLowerCase();

    // 1. attributi di test: messi apposta per identificare, stabilissimi
    for (let i = 0; i < TEST_ATTRS.length; i++) {
      const v = node.getAttribute(TEST_ATTRS[i]);
      if (v) return tag + '[' + TEST_ATTRS[i] + '=' + v + ']';
    }

    // 2. id, se non generato
    if (usableId(node.id)) return tag + '#' + node.id;

    // 3. classe strutturale validata
    const cls = Array.from(node.classList).filter(stableClass)[0];
    if (cls) return tag + '.' + cls;

    // 4. ripiego strutturale: su un'app con sole classi generate e' l'unico
    //    segnale che resta, e regge perche' non dipende dai nomi.
    const role = node.getAttribute('role');
    let d = tag + (role ? '[' + role + ']' : '');
    if (opts && opts.withPosition) {
      const parent = node.parentElement;
      if (parent) {
        const sameTag = Array.from(parent.children).filter(function (c) { return c.tagName === node.tagName; });
        if (sameTag.length > 1) d += ':nth-of-type(' + (sameTag.indexOf(node) + 1) + ')';
      }
    }
    return d;
  }

  /** Percorso CSS breve e realmente utilizzabile come selettore. */
  function cssPath(el) {
    if (!el || el.nodeType !== 1) return '';
    const parts = [];
    let node = el;
    let guard = 0;
    while (node && node.nodeType === 1 && guard++ < 6) {
      if (usableId(node.id)) {
        parts.unshift(node.tagName.toLowerCase() + '#' + esc(node.id));
        break;
      }
      let part = node.tagName.toLowerCase();
      const cls = Array.from(node.classList).filter(stableClass).slice(0, 2);
      if (cls.length) part += '.' + cls.map(esc).join('.');
      const parent = node.parentElement;
      if (parent) {
        const sameTag = Array.from(parent.children).filter(function (c) { return c.tagName === node.tagName; });
        if (sameTag.length > 1) part += ':nth-of-type(' + (sameTag.indexOf(node) + 1) + ')';
      }
      parts.unshift(part);
      node = node.parentElement;
      if (node && node.tagName === 'BODY') break;
    }
    return parts.join(' > ');
  }

  /**
   * Firma del componente: e' la chiave su cui il motore decide se due difetti
   * sono lo stesso problema. Deve restare identica fra pagine diverse, fra
   * siti che condividono il tema, e fra build successive.
   *
   * Volutamente SENZA posizione nell'elenco: il terzo link di una lista e il
   * quindicesimo devono collassare insieme.
   */
  /**
   * Materiale grezzo per la firma del componente.
   *
   * ATTENZIONE: questa funzione non compone piu' la firma, RACCOGLIE I FATTI.
   * La composizione avviene in Node (src/core/signature.ts), perche' e' la
   * funzione piu' soggetta a bug del motore e finche' viveva qui l'unico modo
   * di verificarne una correzione era rilanciare una scansione reale - crawl,
   * rete, minuti di attesa e carico sul sito del cliente. Ora una correzione
   * si valida in millisecondi su una scansione gia' salvata.
   *
   * Il browser osserva, Node giudica: lo stesso principio che regge i check.
   */
  /**
   * Raccoglie SOLO materiale grezzo: catena di antenati, piu' il nome del
   * fornitore quando il browser riesce a riconoscerlo (serve closest, quindi
   * per gli iframe si puo' fare solo qui).
   *
   * La catena si raccoglie ANCHE per gli elementi di terze parti, benche' per
   * loro la firma non la usi. Costa pochi byte e serve a una cosa sola: quando
   * in futuro si aggiungera' un fornitore all'elenco - e succedera', l'elenco
   * e' per forza incompleto - lo si potra' applicare con 'replay' sulle
   * scansioni gia' fatte, invece di doverle rifare. Google Maps incorporata via
   * JS API e' costata esattamente questo.
   */
  function componentSignature(el) {
    if (!el || el.nodeType !== 1) return JSON.stringify({ chain: [] });

    const vendor = vendorOf(el);
    const landmark = el.closest(LANDMARKS);
    const chain = [];
    let node = el;
    let guard = 0;

    while (node && node.tagName !== 'BODY' && guard++ < 9) {
      let testAttr = '';
      for (let i = 0; i < TEST_ATTRS.length; i++) {
        const v = node.getAttribute(TEST_ATTRS[i]);
        if (v) { testAttr = TEST_ATTRS[i] + '=' + v; break; }
      }
      const entry = {
        tag: node.tagName.toLowerCase(),
        classes: Array.from(node.classList).slice(0, 6),
      };
      if (node.id) entry.id = node.id;
      const role = node.getAttribute('role');
      if (role) entry.role = role;
      if (testAttr) entry.testAttr = testAttr;
      if (node === landmark) entry.landmark = true;
      chain.push(entry);
      if (node === landmark) break;
      node = node.parentElement;
    }

    return vendor
      ? JSON.stringify({ chain: chain, vendor: vendor })
      : JSON.stringify({ chain: chain });
  }

  /** Testo accessibile approssimato: serve solo per contesto nei report. */
  function accName(el) {
    if (!el) return '';
    const aria = el.getAttribute && el.getAttribute('aria-label');
    if (aria) return aria.trim();
    const labelledby = el.getAttribute && el.getAttribute('aria-labelledby');
    if (labelledby) {
      const t = labelledby.split(/\\s+/).map((id) => {
        const n = document.getElementById(id);
        return n ? n.textContent || '' : '';
      }).join(' ').trim();
      if (t) return t;
    }
    if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') {
      if (el.id) {
        const lab = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
        if (lab) return (lab.textContent || '').trim();
      }
      const wrap = el.closest('label');
      if (wrap) return (wrap.textContent || '').trim();
      if (el.getAttribute('title')) return el.getAttribute('title').trim();
      return '';
    }
    if (el.tagName === 'IMG') return (el.getAttribute('alt') || '').trim();
    return (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 200);
  }

  function isVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    return true;
  }

  function snippet(el, max) {
    if (!el || !el.outerHTML) return '';
    const h = el.outerHTML.replace(/\\s+/g, ' ');
    return h.length > (max || 300) ? h.slice(0, max || 300) + '...' : h;
  }

  /* --- colore e contrasto ------------------------------------------- */

  function parseColor(str) {
    const m = String(str).match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x.trim()));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }

  function relLum(c) {
    const f = (v) => {
      v = v / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }

  /** Fonde un colore semitrasparente sul suo sfondo. */
  function blend(fg, bg) {
    if (fg.a >= 1) return fg;
    return {
      r: fg.r * fg.a + bg.r * (1 - fg.a),
      g: fg.g * fg.a + bg.g * (1 - fg.a),
      b: fg.b * fg.a + bg.b * (1 - fg.a),
      a: 1,
    };
  }

  /** Risale la catena dei genitori finche' trova uno sfondo opaco. */
  function effectiveBg(el) {
    let node = el;
    let acc = null;
    while (node && node.nodeType === 1) {
      const c = parseColor(getComputedStyle(node).backgroundColor);
      if (c && c.a > 0) {
        acc = acc ? blend(acc, c) : c;
        if (acc.a >= 1) return acc;
      }
      node = node.parentElement;
    }
    return acc && acc.a >= 1 ? acc : { r: 255, g: 255, b: 255, a: 1 };
  }

  function contrast(fgStr, el) {
    const fgRaw = parseColor(fgStr);
    if (!fgRaw) return null;
    const bg = effectiveBg(el);
    const fg = blend(fgRaw, bg);
    const l1 = relLum(fg);
    const l2 = relLum(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    return { ratio: Math.round(ratio * 100) / 100, fg, bg };
  }

  window.__hinto = {
    cssPath, componentSignature, accName, isVisible, snippet,
    parseColor, relLum, contrast, effectiveBg, stableClass, vendorOf,
  };
})();
`;

/**
 * Script che installa il registro delle classi strutturali nella pagina.
 *
 * Va iniettato PRIMA di INJECTED_HELPERS: senza registro le firme ripiegano
 * sul solo filtro sintattico, che su un sito con CSS-in-JS non basta.
 */
export function stableClassesScript(classes: string[]): string {
  return `window.__hintoStable = new Set(${JSON.stringify(classes)});`;
}
