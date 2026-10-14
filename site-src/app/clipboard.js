// Clipboard access with a manual fallback (AC-59).
import { t } from '../i18n/t.js';
export const MANUAL_COPY_MESSAGE = t('status.manualCopy');

/** Resolves 'copied', or 'manual' when the Clipboard API is missing or refuses. Never rejects. */
export async function copyText(text, win) {
  try {
    const clip = win?.navigator?.clipboard;
    if (!clip || typeof clip.writeText !== 'function') return 'manual';
    await clip.writeText(String(text));
    return 'copied';
  } catch {
    return 'manual';
  }
}

/** Selects the contents of `el` so the user can copy by hand. Returns false when selection is unavailable. */
export function selectContents(el, win) {
  try {
    const doc = win.document;
    const range = doc.createRange();
    range.selectNodeContents(el);
    const sel = win.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  } catch {
    return false;
  }
}
