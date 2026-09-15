/**
 * Fingerprinting strutturale delle pagine.
 *
 * E' la leva di efficienza centrale del motore: su un ecosistema da migliaia
 * di URL, auditare il template invece della pagina fa crollare di un ordine
 * di grandezza il lavoro umano, e rende il backlog azionabile (si mette mano
 * al tema, non a quattrocento nodi).
 *
 * La firma ignora il CONTENUTO e guarda solo la FORMA. Ma "forma" non puo'
 * voler dire "nomi delle classi": su un'applicazione con CSS-in-JS quei nomi
 * sono hash rigenerati a ogni build, e includerli produce una firma diversa
 * per ogni pagina - cioe' nessun clustering.
 *
 * Per questo l'estrazione e il calcolo sono separati in due tempi:
 *   1. si raccoglie il materiale grezzo da ogni pagina sondata
 *   2. quando si conoscono le classi ricorrenti su piu' pagine, si calcola
 *      la firma filtrando il materiale
 *
 * Senza questa separazione il registro delle classi non potrebbe esistere,
 * perche' la frequenza si osserva solo dopo aver visto piu' pagine.
 */
import { createHash } from 'node:crypto';
import type { Page } from 'playwright';
import { syntacticallyStable } from '../core/identity.js';

/** Materiale grezzo estratto dalla pagina, prima di qualunque filtro. */
export interface SignatureMaterial {
  bodyClasses: string[];
  landmarks: string[];
  /** Scheletro con classi NON filtrate: il filtro arriva dopo */
  skeletonNodes: Array<{ depth: number; tag: string; classes: string[] }>;
  shape: {
    forms: number;
    tables: number;
    headings: number;
    images: number;
    lists: number;
    articles: number;
    hasSidebar: boolean;
  };
  title: string;
  /** Tutte le classi viste nella pagina: alimentano il registro di frequenza */
  allClasses: string[];
  /** id osservati sulla pagina: servono al registro di frequenza degli id */
  allIds: string[];
  /**
   * URL delle versioni in altra lingua dichiarate dalla pagina stessa
   * (`link rel="alternate" hreflang`). E' il meccanismo standard con cui un
   * sito dichiara le proprie traduzioni: piu' affidabile di qualunque
   * euristica sugli URL, perche' gli slug si traducono
   * (`/it/eventi` diventa `/en/events`) e la forma del percorso non basta.
   */
  alternates: string[];
}

export interface StructuralSignature {
  fingerprint: string;
  inferredLabel: string;
  bodyClasses: string[];
  landmarks: string[];
  skeleton: string;
}

/** Estrae il materiale grezzo. Gira nel browser: dev'essere autocontenuta. */
export async function extractMaterial(page: Page): Promise<SignatureMaterial> {
  return page.evaluate(() => {
    const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'PATH', 'BR', 'TEMPLATE']);
    const all = new Set<string>();

    const collect = (el: Element) => {
      for (const c of Array.from(el.classList)) all.add(c);
    };

    const landmarkSelectors =
      'header,nav,main,aside,footer,form,section[aria-label],section[aria-labelledby],[role="banner"],[role="navigation"],[role="main"],[role="complementary"],[role="contentinfo"],[role="search"],[role="form"]';
    const landmarks = Array.from(document.querySelectorAll(landmarkSelectors)).map((el) => {
      const role = el.getAttribute('role');
      return (role || el.tagName).toLowerCase();
    });

    const skeletonNodes: Array<{ depth: number; tag: string; classes: string[] }> = [];
    const walk = (el: Element, depth: number) => {
      if (depth > 4) return;
      for (const child of Array.from(el.children)) {
        if (SKIP.has(child.tagName)) continue;
        collect(child);
        skeletonNodes.push({
          depth,
          tag: child.tagName.toLowerCase(),
          classes: Array.from(child.classList),
        });
        walk(child, depth + 1);
      }
    };
    const root = document.querySelector('main, [role="main"]') || document.body;
    walk(root, 0);

    // le classi dell'intero documento, non solo del sottoalbero principale
    for (const el of Array.from(document.querySelectorAll('[class]')).slice(0, 3000)) collect(el);

    return {
      bodyClasses: Array.from(document.body.classList),
      landmarks,
      skeletonNodes: skeletonNodes.slice(0, 400),
      shape: {
        forms: document.querySelectorAll('form').length,
        tables: document.querySelectorAll('table').length,
        headings: document.querySelectorAll('h1,h2,h3').length,
        images: document.querySelectorAll('img').length,
        lists: document.querySelectorAll('ul,ol').length,
        articles: document.querySelectorAll('article').length,
        hasSidebar: !!document.querySelector('aside, [role="complementary"]'),
      },
      title: document.title || '',
      allClasses: Array.from(all),
      alternates: Array.from(
        document.querySelectorAll('link[rel="alternate"][hreflang][href]'),
      )
        .map((el) => (el as HTMLLinkElement).href)
        .filter((h) => h && !/x-default/i.test(h))
        .slice(0, 20),
      allIds: Array.from(document.querySelectorAll('[id]'))
        .slice(0, 3000)
        .map((el) => el.id)
        .filter(Boolean),
    };
  });
}

/**
 * Calcola la firma dal materiale, usando solo le classi ritenute strutturali.
 *
 * Quando di classi utilizzabili non ne resta nessuna - il caso dell'app React
 * con sole classi generate - la firma si regge sui soli tag e landmark. E'
 * meno selettiva, quindi il clustering diventa piu' grossolano: due template
 * diversi con lo stesso scheletro possono collidere. E' un compromesso
 * accettabile e soprattutto ONESTO, molto meglio dell'alternativa precedente,
 * che era dichiarare ogni pagina un template a se' e non raggruppare nulla.
 */
export function computeFingerprint(
  material: SignatureMaterial,
  stableClasses: Set<string>,
): StructuralSignature {
  const keep = (classes: string[]): string[] =>
    classes
      .filter((c) => syntacticallyStable(c) && (stableClasses.size === 0 || stableClasses.has(c)))
      .sort();

  const bodyClasses = keep(material.bodyClasses);

  const skeleton = material.skeletonNodes
    .map((n) => {
      const cls = keep(n.classes)[0] ?? '';
      return `${'.'.repeat(n.depth)}${n.tag}${cls ? '#' + cls : ''}`;
    })
    .join('|');

  // Conteggi in fasce larghe: su contenuto editoriale il numero di immagini o
  // di titoli lo decide la redazione, non il template. Fasce strette
  // spezzerebbero un template unico in molti template fantasma.
  const bucket = (n: number) => (n === 0 ? '0' : n <= 3 ? 'pochi' : 'molti');
  const shapeKey = [
    `f${bucket(material.shape.forms)}`,
    `t${bucket(material.shape.tables)}`,
    `l${bucket(material.shape.lists)}`,
    material.shape.hasSidebar ? 'sb' : 'nosb',
  ].join(',');

  const source = [bodyClasses.join(' '), material.landmarks.join('>'), shapeKey, skeleton].join('||');
  const fingerprint = createHash('sha1').update(source).digest('hex').slice(0, 12);

  return {
    fingerprint,
    inferredLabel: inferLabel(bodyClasses, material),
    bodyClasses,
    landmarks: material.landmarks,
    skeleton,
  };
}

/**
 * Etichetta leggibile del cluster: finisce nel report, quindi deve dire
 * qualcosa a chi legge. Prova prima le classi che i CMS mettono sul body,
 * poi il percorso dell'URL, poi la forma.
 */
function inferLabel(bodyClasses: string[], material: SignatureMaterial): string {
  const cmsHints: Array<[RegExp, string]> = [
    [/^(path-)?front(page)?$/, 'Homepage'],
    [/node-?-?type-?-?([a-z]+)/, 'Scheda $1'],
    [/page-node-type-([a-z]+)/, 'Scheda $1'],
    [/^page-([a-z]+)$/, 'Pagina $1'],
    [/^(single|post-type)-([a-z]+)$/, 'Scheda $2'],
    [/search/, 'Risultati di ricerca'],
    [/archive|listing|views/, 'Elenco'],
    [/taxonomy|category|term/, 'Categoria'],
    [/contact/, 'Contatti'],
  ];
  for (const cls of bodyClasses) {
    for (const [re, label] of cmsHints) {
      const m = cls.match(re);
      if (m) return label.replace('$1', m[1] ?? '').replace('$2', m[2] ?? '').trim();
    }
  }

  const s = material.shape;
  if (s.tables >= 1) return 'Pagina con tabelle';
  if (s.articles >= 3 || s.lists >= 4) return 'Elenco';
  if (s.forms >= 1 && s.articles === 0) return 'Pagina con form';
  if (material.landmarks.includes('main') && s.hasSidebar) return 'Contenuto con sidebar';
  return 'Pagina di contenuto';
}

/** Etichetta ricavata dall'URL, quando la struttura non dice nulla di utile. */
export function labelFromUrl(url: string): string | null {
  try {
    const segs = new URL(url).pathname.split('/').filter(Boolean);
    // salta il prefisso di lingua
    const meaningful = segs.filter((s) => !/^[a-z]{2}(-[a-z]{2})?$/i.test(s));
    if (meaningful.length === 0) return 'Homepage';
    const section = meaningful[0].replace(/-/g, ' ');
    const label = section.charAt(0).toUpperCase() + section.slice(1);
    return meaningful.length > 1 ? `Scheda ${section}` : label;
  } catch {
    return null;
  }
}
