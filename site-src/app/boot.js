// Boot sequence of the enhanced page: loading state, index fetch, mount, retry, deferred effects.
// The static list stays visible until the enhanced view is ready, and stays on failure (AC-26, AC-44).
import { h } from './safe-dom.js';
import { assertIndexShape } from '../contract/index-contract.js';
import { createSearch, parseCurated } from '../search/index.js';
import { readState, writeState } from './url-state.js';
import { createStatus, copyAndAnnounce, LOAD_ERROR_TEXT, LOADING_TEXT } from './status.js';
import { createSearchView } from './search-view.js';
import { createBuilderView, isLocked } from './builder-view.js';
import { createTray } from './tray.js';
import { countContents } from './card-view.js';
import { REPO } from '../contract/index-contract.js';

export const RETRY_LABEL = 'Retry loading the search index';

const defer = (win, fn) => (typeof win.requestIdleCallback === 'function' ? win.requestIdleCallback(fn, { timeout: 500 }) : win.setTimeout(fn, 1));

/**
 * opts: {doc, win, fetchFn(url) -> Promise<Response>, curatedTexts, loadEffects(doc, win)}.
 * Resolves {ok: true} once mounted, or {ok: false} after showing the error state. Never rejects.
 */
export async function boot({ doc, win, fetchFn, curatedTexts, loadEffects }) {
  const app = doc.getElementById('app');
  if (!app) return { ok: false };
  const status = createStatus(doc, win);
  const indexUrl = app.getAttribute('data-index-url');

  async function load() {
    app.replaceChildren(h(doc, 'div', { class: 'index-loading' }, h(doc, 'span', { class: 'spinner' }), h(doc, 'p', {}, LOADING_TEXT)));
    app.setAttribute('aria-busy', 'true');
    status.loading();
    try {
      const response = await fetchFn(indexUrl);
      if (!response.ok) throw new Error(`index request failed with status ${response.status}`);
      const index = await response.json();
      assertIndexShape(index);
      const curated = parseCurated(curatedTexts);
      const search = createSearch(index, curated);
      mount(index, curated, search);
      return { ok: true };
    } catch {
      showError();
      return { ok: false };
    }
  }

  function showError() {
    app.setAttribute('aria-busy', 'false');
    status.clear();
    const retry = h(doc, 'button', { type: 'button', class: 'retry' }, RETRY_LABEL);
    retry.addEventListener('click', () => {
      load();
    });
    app.replaceChildren(
      h(
        doc,
        'div',
        { class: 'load-error', role: 'alert' },
        h(doc, 'span', { class: 'state-icon', 'aria-hidden': 'true' }, '!'),
        h(doc, 'p', {}, LOAD_ERROR_TEXT),
        h(doc, 'div', { class: 'state-actions' }, retry),
      ),
    );
  }

  function mount(index, curated, search) {
    const form = doc.getElementById('search-form');
    const input = doc.getElementById('q');
    const builderHost = doc.getElementById('builder');
    const staticList = doc.getElementById('static-list');
    const title = doc.getElementById('catalog-title');
    const plugins = new Map(index.plugins.map((p) => [p.name, p]));
    const contents = countContents(index.artifacts);
    const clearButton = doc.getElementById('search-clear');
    const syncClear = () => {
      if (clearButton) clearButton.hidden = !input.value;
    };
    const initial = readState(win.location.search, plugins.keys());
    const state = { q: initial.q, types: initial.types, plugins: initial.plugins };

    const commit = () => {
      const query = writeState(state);
      win.history.replaceState(null, '', query || win.location.pathname);
    };

    app.replaceChildren();
    input.value = state.q;
    const countSpan = title?.querySelector('.count') ?? null;
    let builderView = null;
    const builderCtx = {
      state: (name) => builderView?.state(name) ?? { checked: false, locked: false },
      toggle: (name, on) => builderView?.toggle(name, on),
    };
    const view = createSearchView({
      doc,
      win,
      form,
      input,
      host: app,
      search,
      curated,
      initial: state,
      cardCtx: {
        doc,
        win,
        status,
        plugins,
        contents,
        builder: builderCtx,
        reveal: (name) => view.reveal(name),
        onRendered: (eff) => {
          if (countSpan) countSpan.textContent = `${eff.hits.length} ${eff.hits.length === 1 ? 'entry' : 'entries'}`;
        },
      },
      onChange: ({ q, types }) => {
        state.q = q;
        state.types = types;
        syncClear();
        commit();
      },
    });
    const countEl = doc.getElementById('builder-count');
    const traySummary = doc.getElementById('tray-summary');
    builderView = createBuilderView({
      doc,
      win,
      host: builderHost,
      plugins: index.plugins,
      selected: state.plugins,
      status,
      onChange: (selected) => {
        state.plugins = selected;
        commit();
      },
      // The rail, the tray and the install-set boxes on the cards all show the same set.
      onUpdate: (entries) => {
        const n = entries.length;
        if (countEl) countEl.textContent = n ? `${n} selected` : '';
        if (traySummary) {
          const names = entries.map((e) => e.name);
          traySummary.textContent = n ? `${n} ${n === 1 ? 'plugin' : 'plugins'}: ${names.slice(0, 3).join(', ')}${n > 3 ? ', …' : ''}` : 'None selected';
        }
        const byName = new Map(entries.map((e) => [e.name, e]));
        for (const box of doc.querySelectorAll('input[data-add-set]')) {
          const entry = byName.get(box.getAttribute('data-add-set'));
          box.checked = Boolean(entry);
          box.disabled = isLocked(entry);
        }
      },
    });
    const tray = doc.getElementById('builder-tray');
    const trayButton = doc.getElementById('tray-open');
    if (tray && trayButton) {
      createTray({ doc, win, panel: builderHost, tray, button: trayButton, behind: [doc.getElementById('site-header'), doc.getElementById('main'), doc.querySelector('.site-footer'), tray] });
    }

    // Copy for the marketplace line in the header, the clear mark and the "/" shortcut.
    const addCopy = doc.getElementById('add-cmd-copy');
    if (addCopy) {
      addCopy.hidden = false;
      addCopy.addEventListener('click', () =>
        copyAndAnnounce({ text: `/plugin marketplace add ${REPO}`, win, status, onManual: () => doc.querySelector('.add-cmd code') }),
      );
    }
    if (clearButton) {
      clearButton.addEventListener('click', () => {
        input.value = '';
        input.dispatchEvent(new win.Event('input', { bubbles: true }));
        input.focus();
      });
    }
    input.addEventListener('input', syncClear);
    doc.addEventListener('keydown', (event) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      const t = event.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      event.preventDefault();
      input.focus();
    });
    syncClear();
    // Render first, then swap the static list for the enhanced view in the same task: no layout jump.
    view.run(true);
    form.hidden = false;
    if (staticList) {
      staticList.hidden = true;
      staticList.removeAttribute('data-fx-cards');
    }
    if (title?.firstChild) title.firstChild.textContent = 'Catalog ';
    app.setAttribute('aria-busy', 'false');
    status.clear();

    // Effects load only after the first render and an idle moment; any failure keeps the static look (AC-54).
    defer(win, () => {
      Promise.resolve()
        .then(() => loadEffects?.(doc, win))
        .catch(() => {});
    });
  }

  return load();
}
