/**
 * Esecuzione di axe-core dentro la pagina.
 *
 * axe e' il livello deterministico: poche regole, pochissimi falsi positivi,
 * mappatura diretta sui criteri. Deque dichiara circa il 57% delle issue WCAG
 * intercettabili automaticamente - ed e' esattamente il motivo per cui sopra
 * ci servono i check custom e il triage umano.
 *
 * Licenza: axe-core e' MPL-2.0. Lo usiamo come dipendenza senza modificarne
 * i sorgenti, quindi nessun obbligo di pubblicazione ricade su questo motore.
 */
import axe from 'axe-core';
import type { Page } from 'playwright';
import { criteriaFromAxeTags } from '../core/wcag.js';
import type { RawObservation } from './checks.js';

export const AXE_VERSION = axe.version;

/**
 * Tag della baseline normativa: WCAG 2.0 e 2.1, livelli A e AA.
 * NON includiamo wcag22aa: quei criteri non sono vincolanti finche' la norma
 * armonizzata EN 301 549 non viene aggiornata, e dichiararli come non
 * conformita' rende il backlog contestabile.
 */
export const BASELINE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** Criteri WCAG 2.2: raccolti a parte, riportati come raccomandazione. */
export const FORWARD_TAGS = ['wcag22a', 'wcag22aa'];

/**
 * Osservazione in italiano a partire dai dati strutturati di axe.
 *
 * axe restituisce `failureSummary` in inglese e in forma prescrittiva
 * ("Elements must meet minimum color contrast ratio thresholds..."). In un
 * documento che va a un ateneo quel testo non e' accettabile, e tradurlo a
 * mano riga per riga sarebbe fragile. Fortunatamente per le regole che
 * contano axe espone anche i valori misurati: da quelli si scrive una frase
 * italiana precisa. Dove i dati non bastano, si tiene il testo originale -
 * che e' il segnale che quella regola va aggiunta qui.
 */
function italianObservation(
  ruleId: string,
  help: string,
  checks: Array<{ id: string; message: string; data: unknown }>,
  fallback: string,
): string {
  const d = (checks[0]?.data ?? {}) as Record<string, unknown>;

  switch (ruleId) {
    case 'color-contrast':
    case 'color-contrast-enhanced': {
      const ratio = d.contrastRatio;
      const expected = d.expectedContrastRatio;
      // Sui risultati "incomplete" axe spesso non misura nulla: senza questa
      // guardia nel rapporto finiva la frase "Contrasto misurato 0:1 fra il
      // testo (undefined) e lo sfondo (undefined)".
      if (!ratio || !d.fgColor || !d.bgColor) {
        return (
          'Non e\' stato possibile misurare automaticamente il contrasto di questo testo, ' +
          'in genere perche\' sta su un\'immagine, un gradiente o uno sfondo semitrasparente. ' +
          'Va verificato a mano.'
        );
      }
      const size = d.fontSize ? `, ${d.fontSize}` : '';
      const weight = d.fontWeight && d.fontWeight !== 'normal' ? `, ${d.fontWeight}` : '';
      return (
        `Contrasto misurato ${ratio}:1 fra il testo (${d.fgColor}) e lo sfondo (${d.bgColor})${size}${weight}. ` +
        `La soglia richiesta e' ${expected ?? '4.5:1'}.`
      );
    }
    case 'html-has-lang':
      return "L'elemento html non dichiara la lingua del contenuto.";
    case 'html-lang-valid':
      return `Il codice di lingua dichiarato non e' valido${d.messageKey ? '' : ''}.`;
    case 'image-alt':
      return "L'immagine non ha l'attributo alt: manca del tutto l'alternativa testuale.";
    case 'link-name':
      return "Il link non ha un nome accessibile: viene annunciato senza indicare la destinazione.";
    case 'button-name':
      return 'Il pulsante non ha un nome accessibile: viene annunciato senza indicare la sua funzione.';
    case 'label':
      return "Il campo non e' associato ad alcuna etichetta nel codice.";
    case 'select-name':
      return "Il menu di selezione non ha un nome accessibile.";
    case 'document-title':
      return 'La pagina non ha un titolo nel tag title.';
    case 'duplicate-id':
    case 'duplicate-id-active':
    case 'duplicate-id-aria':
      return `L'identificatore "${d.id ?? ''}" e' usato da piu' di un elemento nella stessa pagina.`;
    case 'heading-order':
      return "Il livello di questo titolo non segue quello del titolo precedente.";
    case 'landmark-one-main':
      return "La pagina non ha un landmark main che delimiti il contenuto principale.";
    case 'region':
      return 'Questo contenuto non e\' racchiuso in alcun landmark.';
    case 'bypass':
      return "Manca un meccanismo per saltare i blocchi di contenuto ripetuti.";
    case 'frame-title':
      return "Il contenuto incorporato (iframe) non ha un titolo che lo descriva.";
    case 'meta-viewport':
      return "Il meta viewport impedisce o limita l'ingrandimento della pagina.";
    case 'list':
      return "L'elenco contiene elementi che non sono voci di lista.";
    case 'listitem':
      return "Questa voce di elenco non e' contenuta in un ul o ol.";
    case 'target-size': {
      const w = d.width;
      const h = d.height;
      if (w && h) return `L'area interattiva misura ${w}x${h} pixel, sotto il minimo di 24x24.`;
      return "L'area interattiva e' piu' piccola della dimensione minima di 24x24 pixel.";
    }
    case 'nested-interactive':
      return "Questo elemento interattivo ne contiene un altro: le tecnologie assistive non sanno quale annunciare.";
    case 'aria-hidden-focus':
      return "L'elemento e' nascosto alle tecnologie assistive ma riceve comunque il focus da tastiera.";
    case 'input-image-alt':
      return "Il pulsante immagine non ha l'attributo alt.";
    case 'svg-img-alt':
    case 'role-img-alt':
      return "L'elemento ha ruolo di immagine ma nessun nome accessibile.";
    case 'meta-refresh':
      return 'La pagina si ricarica o reindirizza automaticamente.';
    default:
      break;
  }

  return fallback || help;
}

export interface AxeOutcome {
  observations: RawObservation[];
  /** Regole passate: servono a dimostrare la copertura nel report */
  passedRules: string[];
  /** Regole che axe stessa segnala come da verificare a mano */
  incompleteCount: number;
}

/**
 * La misura del contrasto e' stata impedita da qualcosa che sta SOPRA?
 *
 * Messaggi di axe osservati su siti reali:
 *   "Element's background color could not be determined because it is
 *    overlapped by another element"
 *   "...because it partially overlaps other elements"
 *
 * Entrambi dicono la stessa cosa: c'e' un elemento sovrapposto - un banner
 * cookie, una lightbox, una finestra di dialogo, una slide di carosello - e il
 * colore di sfondo reale non e' calcolabile. Non e' un difetto del sito.
 *
 * Volutamente NON confuso con "contains an image node" o "due to a background
 * gradient": quelli sono dubbi veri, che una persona deve sciogliere guardando.
 */
export function misuraImpeditaDaSovrapposizione(
  checks: Array<{ message?: string }> | undefined,
): boolean {
  if (!checks?.length) return false;
  return checks.some((c) => /overlap(ped|s)\b/i.test(String(c.message ?? '')));
}

export async function runAxe(
  page: Page,
  includeForward = true,
  /** Limita l'analisi a un sottoalbero: usato per auditare il banner cookie da solo. */
  includeSelector?: string,
): Promise<AxeOutcome> {
  await page.evaluate(axe.source);

  const tags = includeForward ? [...BASELINE_TAGS, ...FORWARD_TAGS] : BASELINE_TAGS;

  const results = await page.evaluate(async ({ runTags, scope }) => {
    const H = (window as any).__hinto;
    const context = scope ? (document.querySelector(scope) ?? document) : document;
    const r = await (window as any).axe.run(context, {
      runOnly: { type: 'tag', values: runTags },
      resultTypes: ['violations', 'incomplete'],
      elementRef: false,
      selectors: true,
      ancestry: false,
    });

    // Arricchiamo ogni nodo con la firma del componente: serve alla deduplica
    const enrich = (nodes: any[]) =>
      nodes.map((n: any) => {
        let componentSignature = 'unknown';
        let cssPath = Array.isArray(n.target) ? n.target.join(' ') : String(n.target);
        try {
          const el = document.querySelector(cssPath);
          if (el) {
            componentSignature = H.componentSignature(el);
            cssPath = H.cssPath(el) || cssPath;
          }
        } catch {
          /* selettore non risolvibile: teniamo quello di axe */
        }
        return {
          html: n.html,
          target: cssPath,
          failureSummary: n.failureSummary || '',
          componentSignature,
          any: (n.any || []).map((a: any) => ({ id: a.id, message: a.message, data: a.data })),
        };
      });

    return {
      violations: r.violations.map((v: any) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        description: v.description,
        helpUrl: v.helpUrl,
        tags: v.tags,
        nodes: enrich(v.nodes),
      })),
      incomplete: r.incomplete.map((v: any) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        description: v.description,
        helpUrl: v.helpUrl,
        tags: v.tags,
        nodes: enrich(v.nodes),
      })),
      passes: r.passes ? r.passes.map((p: any) => p.id) : [],
    };
  }, { runTags: tags, scope: includeSelector ?? null });

  const observations: RawObservation[] = [];

  for (const v of results.violations) {
    const criteria = criteriaFromAxeTags(v.id, v.tags);
    for (const node of v.nodes) {
      observations.push({
        checkId: `axe:${v.id}`,
        criteria,
        selector: node.target,
        componentSignature: node.componentSignature,
        html: node.html?.slice(0, 400) ?? '',
        observation: italianObservation(
          v.id,
          v.help,
          node.any,
          `${v.help}. ${node.failureSummary.replace(/\n+/g, ' ').trim()}`.trim(),
        ),
        data: {
          axeRule: v.id,
          axeDescription: v.description,
          axeFailureSummary: node.failureSummary,
          helpUrl: v.helpUrl,
          axeResult: 'violation',
          checks: node.any,
        },
        engineImpact: v.impact ?? 'moderate',
      });
    }
  }

  /**
   * Un risultato "incomplete" di axe non e' un difetto: e' axe che dichiara di
   * non aver potuto decidere. Il MOTIVO pero' cambia tutto, e finora veniva
   * buttato via insieme al resto.
   *
   * Osservato su due siti reali, i motivi sono tre e vogliono tre destini:
   *
   *   "could not be determined because it is overlapped by another element"
   *   "...because it partially overlaps other elements"
   *      Non e' un problema del sito: e' la misura resa impossibile da qualcosa
   *      che sta SOPRA. Su tef.tech erano il banner cookie di Iubenda e le
   *      slide di un carosello - lightbox, finestre di dialogo, overlay
   *      appiccicati. Quattordici segnalazioni su ventinove, tutte da buttare.
   *      Mandarle in coda di revisione significa far guardare a una persona
   *      un difetto che non esiste.
   *
   *   "...because element contains an image node"
   *   "...due to a background gradient"
   *      Qui il dubbio e' vero e nessuno strumento puo' scioglierlo: testo
   *      sopra un'immagine o un gradiente si giudica guardandolo. Resta in
   *      coda, ed e' il caso piu' frequente (440 evidenze su hintogroup.eu).
   *
   * Se un giorno axe cambiasse il testo di questi messaggi, il filtro
   * smetterebbe di riconoscere la sovrapposizione e le segnalazioni
   * tornerebbero in coda: si degrada verso il rumore, non verso il silenzio.
   */
  for (const v of results.incomplete) {
    const criteria = criteriaFromAxeTags(v.id, v.tags);
    for (const node of v.nodes.slice(0, 5)) {
      if (v.id === 'color-contrast' && misuraImpeditaDaSovrapposizione(node.any)) continue;
      observations.push({
        checkId: `axe-incomplete:${v.id}`,
        criteria,
        selector: node.target,
        componentSignature: node.componentSignature,
        html: node.html?.slice(0, 400) ?? '',
        observation:
          italianObservation(v.id, v.help, node.any, v.help) +
          ' — la verifica automatica non ha potuto decidere: serve un controllo manuale.',
        data: {
          axeRule: v.id,
          helpUrl: v.helpUrl,
          axeResult: 'incomplete',
          checks: node.any,
        },
        engineImpact: v.impact ?? 'minor',
      });
    }
  }

  return {
    observations,
    passedRules: results.passes,
    incompleteCount: results.incomplete.reduce((n: number, v: any) => n + v.nodes.length, 0),
  };
}
