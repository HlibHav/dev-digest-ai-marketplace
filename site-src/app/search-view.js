// Search box, type filters and result list (AC-11, AC-18 to AC-20, AC-22, AC-47).
import { h } from './safe-dom.js';
import { TYPES } from '../contract/index-contract.js';
import { t } from '../i18n/t.js';
import { tokenize } from '../search/index.js';
import { TYPE_LABELS, createCard } from './card-view.js';

// Icon glyph, not a translatable word.
const SYMBOL_UNKNOWN = '?';
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

/** Free-text queries read as rows with room for the description; the empty query and pure type listings stay a grid. */
export const isListMode = (eff) => eff.terms.length > 0;

/** Number of hits per type, for the counts on the filter pills. */
export function countByType(hits) {
  const counts = {};
  for (const hit of hits) counts[hit.doc.type] = (counts[hit.doc.type] ?? 0) + 1;
  return counts;
}

/** Text for the polite result-count region. */
export function countMessage(state, total, shown = total) {
  if (state === 'no-results') return t('search.noResults');
  const part = shown < total ? `, ${t('search.countShowingFirst', { shown })}` : '';
  if (state === 'empty-query') return `${t('search.countCatalog', { count: total })}${part}`;
  return `${t('search.countResults', { count: total })}${part}`;
}

/** "type skill, text zzzzqq" for the no-results message. */
export function describeInterpretation(types, terms) {
  const parts = [];
  if (types.length) parts.push(t('search.describeTypes', { types: types.map((type) => TYPE_LABELS[type] ?? type).join(` ${t('search.listOr')} `) }));
  if (terms.length) parts.push(t('search.describeText', { terms: terms.join(' ') }));
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
  const counts = new Map();
  const froms = new Map();
  const filterGroup = h(doc, 'div', { class: 'filters', role: 'group', 'aria-labelledby': 'filters-legend' });
  filterGroup.append(h(doc, 'span', { class: 'filters-legend', id: 'filters-legend' }, t('search.filterLegend')));
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
    const count = h(doc, 'span', { class: 'filter-count' });
    const from = h(doc, 'span', { class: 'filter-from', hidden: true }, t('search.fromQuery'));
    counts.set(type, count);
    froms.set(type, from);
    filterGroup.append(h(doc, 'label', { class: 'filter', 'data-type': type }, box, TYPE_LABELS[type], ' ', count, ' ', from));
  }

  const interpretation = h(doc, 'div', { class: 'interpretation', hidden: true });
  const noResults = h(doc, 'div', { class: 'no-results', hidden: true });
  const list = h(doc, 'ul', { class: 'grid', 'data-fx-cards': '', 'aria-label': t('search.resultsAria') });
  const more = h(doc, 'div', { class: 'more', hidden: true });
  host.append(interpretation, filterGroup, noResults, list, more);

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

  function renderInterpretation(eff) {
    if (!eff.types.length && !eff.terms.length) {
      interpretation.replaceChildren();
      interpretation.hidden = true;
      return;
    }
    const chip = (label, value) => h(doc, 'span', { class: 'interp-chip' }, h(doc, 'b', {}, label), ' ', value);
    interpretation.replaceChildren(
      t('search.showing'),
      ...eff.types.map((type) => chip(t('search.interpType'), TYPE_LABELS[type] ?? type)),
      ...eff.terms.map((term) => chip(t('search.interpText'), term)),
    );
    interpretation.hidden = false;
  }

  function renderFilters(result, eff) {
    const byType = countByType(result.hits);
    for (const type of TYPES) {
      counts.get(type).textContent = String(byType[type] ?? 0);
      froms.get(type).hidden = !(eff.types.includes(type) && !chips.has(type));
    }
  }

  function renderNoResults(eff) {
    const hasFilter = eff.types.length > 0;
    const button = h(doc, 'button', { type: 'button', class: 'clear-filter', 'data-clear': hasFilter ? 'filter' : 'search' }, hasFilter ? t('search.clearFilter') : t('search.clearSearch'));
    button.addEventListener('click', clearFilter);
    noResults.replaceChildren(
      h(doc, 'span', { class: 'state-icon', 'aria-hidden': 'true' }, SYMBOL_UNKNOWN),
      h(doc, 'p', { class: 'no-results-title' }, t('search.noResults')),
      h(doc, 'p', { class: 'no-results-detail' }, t('search.searchedFor', { query: describeInterpretation(eff.types, eff.terms) || t('search.nothing') })),
      h(doc, 'div', { class: 'state-actions' }, button),
    );
    noResults.hidden = false;
  }

  function run(announce = true) {
    const result = search.search(input.value);
    const eff = effectiveResult(result, [...chips]);
    const visible = eff.hits.slice(0, shown);
    list.setAttribute('class', isListMode(eff) ? 'grid is-list' : 'grid');
    renderInterpretation(eff);
    renderFilters(result, eff);
    list.replaceChildren(...visible.map((hit) => createCard(cardCtx, hit, eff.terms)));
    if (eff.state === 'no-results') renderNoResults(eff);
    else {
      noResults.hidden = true;
      noResults.replaceChildren();
    }
    if (eff.hits.length > visible.length) {
      const button = h(doc, 'button', { type: 'button', class: 'show-more' }, t('search.showMore', { count: Math.min(PAGE_SIZE, eff.hits.length - visible.length) }));
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

  /** Shows the card of `name`, clearing the query and the type filter first when the current results leave it out. */
  function reveal(name) {
    const find = () => doc.getElementById(`plugin-${name}`);
    if (!find()) {
      input.value = '';
      chips.clear();
      syncBoxes();
      shown = Number.MAX_SAFE_INTEGER;
      run();
      shown = PAGE_SIZE;
      onChange({ q: '', types: [] });
    }
    const target = find();
    if (!target) return;
    if (typeof target.scrollIntoView === 'function') target.scrollIntoView({ block: 'center' });
    target.focus();
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

  return { run, reveal };
}
