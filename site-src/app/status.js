// Status line, live regions and the shared copy routine (AC-21, AC-44, AC-47, AC-59).
import { copyText, selectContents, MANUAL_COPY_MESSAGE } from './clipboard.js';

export const LOADING_TEXT = 'Loading the search index…';
export const LOAD_ERROR_TEXT = 'Search is unavailable because the index could not be loaded. The plugin list on this page still works.';
export const COPIED_TEXT = 'Copied';
export { MANUAL_COPY_MESSAGE };

const ANNOUNCE_DELAY_MS = 40;

/** Wraps the three live regions of the static page: #status, #result-count and #copy-status. */
export function createStatus(doc, win) {
  const statusEl = doc.getElementById('status');
  const countEl = doc.getElementById('result-count');
  const copyEl = doc.getElementById('copy-status');
  const set = (el, text) => {
    if (el) el.textContent = text;
  };
  // Clearing first makes a repeated message count as a change for screen readers.
  const announce = (el, text) => {
    set(el, '');
    win.setTimeout(() => set(el, text), ANNOUNCE_DELAY_MS);
  };
  return {
    loading: () => set(statusEl, LOADING_TEXT),
    clear: () => set(statusEl, ''),
    count: (text) => set(countEl, text),
    copied: () => announce(copyEl, COPIED_TEXT),
    manual: () => announce(copyEl, MANUAL_COPY_MESSAGE),
  };
}

/**
 * Copies `text`. On success announces "Copied". When the Clipboard API is missing or refuses,
 * `onManual()` must return the element that holds the text; it is selected and the manual-copy
 * message is announced (AC-59).
 */
export async function copyAndAnnounce({ text, win, status, onManual }) {
  const result = await copyText(text, win);
  if (result === 'copied') {
    status.copied();
    return result;
  }
  const el = onManual ? onManual() : null;
  if (el) selectContents(el, win);
  status.manual();
  return result;
}
