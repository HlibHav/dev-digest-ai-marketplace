// Below 1024 px the install set lives in a bottom tray. "Review" opens the same #builder panel as a modal
// bottom sheet: focus moves in, Escape and the close button hand focus back to the tray button, and the rest
// of the page is inert while the sheet is open.
import { h } from './safe-dom.js';
import { t } from '../i18n/t.js';

// Icon glyph, not a translatable word.
const SYMBOL_CLOSE = '×';
export const WIDE_QUERY = '(min-width: 1024px)';
export const CLOSE_LABEL = t('tray.closeAria');

/**
 * opts: {doc, win, panel, tray, button, behind[]}. `behind` lists the elements made inert while the sheet is open.
 * Returns {open(), close(), isOpen()}.
 */
export function createTray({ doc, win, panel, tray, button, behind = [] }) {
  let closeButton = null;
  let wide = null;
  try {
    wide = win.matchMedia ? win.matchMedia(WIDE_QUERY) : null;
  } catch {
    wide = null;
  }

  const isOpen = () => panel.hasAttribute('data-open');
  const setInert = (on) => {
    for (const el of behind) if (el) el.inert = on;
  };

  function onKey(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  }
  function onBackdrop(event) {
    if (event.target === doc.body) close();
  }

  function open() {
    if (isOpen() || (wide && wide.matches)) return;
    closeButton = h(doc, 'button', { type: 'button', class: 'icon-btn', 'data-close': '', 'aria-label': CLOSE_LABEL }, SYMBOL_CLOSE);
    closeButton.addEventListener('click', () => close());
    const head = panel.querySelector('.builder-head');
    (head ?? panel).append(closeButton);
    panel.setAttribute('data-open', '');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    button.setAttribute('aria-expanded', 'true');
    setInert(true);
    doc.addEventListener('keydown', onKey);
    doc.addEventListener('click', onBackdrop);
    closeButton.focus();
  }

  function close(returnFocus = true) {
    if (!isOpen()) return;
    doc.removeEventListener('keydown', onKey);
    doc.removeEventListener('click', onBackdrop);
    panel.removeAttribute('data-open');
    panel.removeAttribute('role');
    panel.removeAttribute('aria-modal');
    closeButton?.remove();
    closeButton = null;
    setInert(false);
    button.setAttribute('aria-expanded', 'false');
    if (returnFocus) button.focus();
  }

  button.addEventListener('click', () => (isOpen() ? close() : open()));
  if (wide && typeof wide.addEventListener === 'function') {
    wide.addEventListener('change', (event) => {
      if (event.matches) close(false);
    });
  }
  tray.hidden = false;
  return { open, close, isOpen };
}
