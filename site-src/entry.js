// Browser entry: wires the curated word lists (text loader) into the boot sequence.
import dictionary from '../data/dictionary.ua-en.txt';
import stopUk from '../data/stopwords.uk.txt';
import stopEn from '../data/stopwords.en.txt';
import typewords from '../data/typewords.txt';
import { boot } from './app/boot.js';

export const curatedTexts = { dictionary, stopUk, stopEn, typewords };

/** Loads the effects bundle on demand. Any failure keeps the static look and shows nothing (AC-54). */
async function loadEffects(doc, win) {
  try {
    const { startEffects } = await import('./effects/fx-entry.js');
    await startEffects({ root: doc, win });
  } catch {
    /* static look stays */
  }
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  const run = () => boot({ doc: document, win: window, fetchFn: (url) => window.fetch(url), curatedTexts, loadEffects });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
}
