// Boot sequence of the enhanced page: loading state, index fetch, mount, retry, deferred effects.
// The static list stays visible until the enhanced view is ready, and stays on failure (AC-26, AC-44).
import { h } from './safe-dom.js';
import { assertIndexShape } from '../contract/index-contract.js';
import { createSearch, parseCurated } from '../search/index.js';
import { readState, writeState } from './url-state.js';
import { createStatus, LOAD_ERROR_TEXT } from './status.js';
import { createSearchView } from './search-view.js';
import { createBuilderView } from './builder-view.js';

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
    app.replaceChildren();
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
    app.replaceChildren(h(doc, 'div', { class: 'load-error', role: 'alert' }, h(doc, 'p', {}, LOAD_ERROR_TEXT), retry));
  }

  function mount(index, curated, search) {
    const form = doc.getElementById('search-form');
    const input = doc.getElementById('q');
    const builderHost = doc.getElementById('builder');
    const staticList = doc.getElementById('static-list');
    const title = doc.getElementById('catalog-title');
    const plugins = new Map(index.plugins.map((p) => [p.name, p]));
    const initial = readState(win.location.search, plugins.keys());
    const state = { q: initial.q, types: initial.types, plugins: initial.plugins };

    const commit = () => {
      const query = writeState(state);
      win.history.replaceState(null, '', query || win.location.pathname);
    };

    app.replaceChildren();
    input.value = state.q;
    const countSpan = title?.querySelector('.count') ?? null;
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
        onRendered: (eff) => {
          if (countSpan) countSpan.textContent = `${eff.hits.length} ${eff.hits.length === 1 ? 'entry' : 'entries'}`;
        },
      },
      onChange: ({ q, types }) => {
        state.q = q;
        state.types = types;
        commit();
      },
    });
    createBuilderView({
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
    });
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
