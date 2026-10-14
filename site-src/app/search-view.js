// Search box, type filters and result list (AC-11, AC-18 to AC-20, AC-22, AC-47).
import { h } from './safe-dom.js';
import { TYPES } from '../contract/index-contract.js';
import { tokenize } from '../search/index.js';
import { TYPE_LABELS, createCard } from './card-view.js';

export const DEBOUNCE_MS = 120;
export const PAGE_SIZE = 100;

const unique = (list) => [...new Set(list)];

/** Removes the words that act as a type filter from `raw` ("skill zzzzqq" -> "zzzzqq"). */
export function stripTypeWords(raw, curated) {
  const kept = String(raw ?? '')
    .split(/\s+/)
    .filter((word) => {
      const tokens = tokenize(word);
      return !(tokens.length > 0 && tokens.every((t) => curated.typeForms.has(t)));
    });
  return kept.join(' ');
}

/** Applies the checkbox filters on top of the engine result and decides the state to show. */
export function effectiveResult(result, chips) {
  const hits = chips.length ? result.hits.filter((x) => chips.includes(x.doc.type)) : result.hits;
  let state = result.state;
  if (hits.length === 0) state = result.state === 'empty-query' && chips.length === 0 ? 'empty-query' : 'no-results';
  else if (chips.length && result.state === 'empty-query') state = 'type-listing';
  return {
    state,
    hits,
    types: unique([...result.interpretation.types, ...chips]),
    terms: result.interpretation.terms,
  };
}

/** Text for the polite result-count region. */
export function countMessage(state, total, shown = total) {
  if (state === 'no-results') return 'No results';
  const part = shown < total ? `, showing the first ${shown}` : '';
  if (state === 'empty-query') return `Showing the full catalog: ${total} ${total === 1 ? 'entry' : 'entries'}${part}`;
  return `${total} ${total === 1 ? 'result' : 'results'}${part}`;
}

/** "type skill, text zzzzqq" for the no-results message. */
export function describeInterpretation(types, terms) {
  const parts = [];
  if (types.length) parts.push(`type ${types.map((t) => TYPE_LABELS[t] ?? t).join(' or ')}`);
  if (terms.length) parts.push(`text ${terms.join(' ')}`);
  return parts.join(', ');
}

/**
 * opts: {doc, win, form, input, host, search, curated, cardCtx, initial: {q, types[]}, onChange({q, types})}.
 * `host` is #app. Returns {run(announce?)}.
 */
export function createSearchView({ doc, win, form, input, host, search, curated, cardCtx, initial, onChange }) {
  const chips = new Set((initial.types ?? []).filter((t) => TYPES.includes(t)));
  let shown = PAGE_SIZE;
  let timer = null;

  const boxes = new Map();
  const filterGroup = h(doc, 'div', { class: 'filters', role: 'group', 'aria-label': 'Filter by type' });
  for (const type of TYPES) {
    const box = h(doc, 'input', { type: 'checkbox', name: 'type', value: type, checked: chips.has(type) });
    box.addEventListener('change', () => {
      if (box.checked) chips.add(type);
      else chips.delete(type);
      shown = PAGE_SIZE;
      run();
      onChange({ q: input.value, types: [...chips] });
    });
    boxes.set(type, box);
    filterGroup.append(h(doc, 'label', { class: 'filter' }, box, ' ', TYPE_LABELS[type]));
  }

  const noResults = h(doc, 'div', { class: 'no-results', hidden: true });
  const list = h(doc, 'ul', { class: 'cards results', 'data-fx-cards': '', 'aria-label': 'Search results' });
  const more = h(doc, 'div', { class: 'more', hidden: true });
  host.append(filterGroup, noResults, list, more);

  const syncBoxes = () => {
    for (const [type, box] of boxes) box.checked = chips.has(type);
  };

  function clearFilter() {
    input.value = stripTypeWords(input.value, curated);
    chips.clear();
    syncBoxes();
    shown = PAGE_SIZE;
    run();
    onChange({ q: input.value, types: [] });
    input.focus();
  }

  function renderNoResults(eff) {
    const hasFilter = eff.types.length > 0;
    const button = h(doc, 'button', { type: 'button', class: 'clear-filter', 'data-clear': hasFilter ? 'filter' : 'search' }, hasFilter ? 'Clear the type filter' : 'Clear the search');
    button.addEventListener('click', clearFilter);
    noResults.replaceChildren(
      h(doc, 'p', { class: 'no-results-title' }, 'No results'),
      h(doc, 'p', { class: 'interpretation' }, `Searched for: ${describeInterpretation(eff.types, eff.terms) || 'nothing'}`),
      button,
    );
    noResults.hidden = false;
  }

  function run(announce = true) {
    const eff = effectiveResult(search.search(input.value), [...chips]);
    const visible = eff.hits.slice(0, shown);
    list.replaceChildren(...visible.map((hit) => createCard(cardCtx, hit, eff.terms)));
    if (eff.state === 'no-results') renderNoResults(eff);
    else {
      noResults.hidden = true;
      noResults.replaceChildren();
    }
    if (eff.hits.length > visible.length) {
      const button = h(doc, 'button', { type: 'button', class: 'show-more' }, `Show ${Math.min(PAGE_SIZE, eff.hits.length - visible.length)} more`);
      button.addEventListener('click', () => {
        shown += PAGE_SIZE;
        run(false);
      });
      more.replaceChildren(button);
      more.hidden = false;
    } else {
      more.replaceChildren();
      more.hidden = true;
    }
    if (announce) cardCtx.status.count(countMessage(eff.state, eff.hits.length, visible.length));
    cardCtx.onRendered?.(eff);
    return eff;
  }

  input.addEventListener('input', () => {
    win.clearTimeout(timer);
    timer = win.setTimeout(() => {
      shown = PAGE_SIZE;
      run();
      onChange({ q: input.value, types: [...chips] });
    }, DEBOUNCE_MS);
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    win.clearTimeout(timer);
    shown = PAGE_SIZE;
    run();
    onChange({ q: input.value, types: [...chips] });
  });

  return { run };
}
