// One result card (AC-20) with a copy-install button (AC-21, AC-59). Built with safe-dom only.
import { h } from './safe-dom.js';
import { highlightRanges, appendHighlighted } from './highlight.js';
import { MARKETPLACE, REPO } from '../contract/index-contract.js';
import { copyAndAnnounce } from './status.js';
import { renderTrustCost, wireFlip } from './trust-view.js';
import { compatibilityText, whatsNew } from './plugin-facts.js';
import { t } from '../i18n/t.js';

export const TYPE_LABELS = Object.freeze({
  plugin: t('type.plugin'),
  skill: t('type.skill'),
  agent: t('type.agent'),
  command: t('type.command'),
  hook: t('type.hook'),
  mcp_server: t('type.mcpServer'),
});
// One entry per type a plugin can ship; the message holds the singular and plural forms.
const CONTENT_LABELS = Object.freeze({
  skill: (count) => t('card.contents.skill', { count }),
  agent: (count) => t('card.contents.agent', { count }),
  command: (count) => t('card.contents.command', { count }),
  hook: (count) => t('card.contents.hook', { count }),
  mcp_server: (count) => t('card.contents.mcpServer', { count }),
});
export const DESCRIPTION_LIMIT = 280;
export const COPY_LABEL = t('card.copyInstall');
export const ADD_SET_LABEL = t('card.addToInstallSet');
export const OWNER_LABEL = t('card.installsWith');

export const addSetNoteId = (name) => `add-set-note-${name}`;

/**
 * Brings a card's install-set box and its note in line with `state` ({checked, locked, auto, parents}).
 * A locked box says why, in text next to it, and points at that text with aria-describedby.
 */
export function applyAddSet(box, note, state) {
  box.checked = state.checked;
  box.disabled = state.locked;
  const parents = state.parents?.join(', ') ?? '';
  let text = '';
  if (state.locked && parents) text = state.auto ? t('card.addedAsDependency', { parents }) : t('card.alsoRequired', { parents });
  if (note) {
    note.textContent = text;
    note.hidden = !text;
  }
  if (text && note) box.setAttribute('aria-describedby', note.getAttribute('id'));
  else box.removeAttribute?.('aria-describedby');
}

/** The two lines AC-21 puts on the clipboard: the marketplace must be added before the plugin installs. */
export function installLines(pluginName) {
  return [`/plugin marketplace add ${REPO}`, `/plugin install ${pluginName}@${MARKETPLACE}`];
}

/** Cuts `text` to `limit` characters (code points) and marks the cut with an ellipsis. */
export function truncate(text, limit = DESCRIPTION_LIMIT) {
  const chars = Array.from(String(text ?? ''));
  return chars.length <= limit ? chars.join('') : `${chars.slice(0, limit).join('').trimEnd()}…`;
}

/** Counts the non-plugin artifacts of each plugin: Map<plugin, {skill: 2, hook: 1, ...}>. */
export function countContents(artifacts) {
  const out = new Map();
  for (const a of artifacts ?? []) {
    if (a.type === 'plugin') continue;
    const counts = out.get(a.plugin) ?? {};
    counts[a.type] = (counts[a.type] ?? 0) + 1;
    out.set(a.plugin, counts);
  }
  return out;
}

/** "2 skills", "1 agent": one entry per type that the plugin ships, in type order. */
export function contentsEntries(counts) {
  return Object.keys(CONTENT_LABELS)
    .filter((type) => counts?.[type] > 0)
    .map((type) => ({ type, text: CONTENT_LABELS[type](counts[type]) }));
}

function highlighted(doc, tag, attrs, text, terms) {
  const el = h(doc, tag, attrs);
  appendHighlighted(el, text, highlightRanges(text, terms));
  return el;
}

/**
 * ctx: {doc, win, status, plugins: Map<name, plugin>, contents?: Map, builder?: {state(name), toggle(name, on)},
 * reveal?(pluginName)}.
 * hit: {doc, score, terms[]}; extraTerms: interpreted query terms to highlight as well.
 */
export function createCard(ctx, hit, extraTerms = []) {
  const { doc: d, win, status, plugins } = ctx;
  const item = hit.doc;
  const terms = [...new Set([...(hit.terms ?? []), ...extraTerms])];
  const owner = plugins.get(item.plugin);
  const isPlugin = item.type === 'plugin';

  // A plugin card turns over to show its trust profile and cost (AC-60): the front face keeps today's content.
  const flips = isPlugin && Boolean(owner);
  const attrs = { class: flips ? 'card has-flip' : 'card', 'data-card': '', 'data-type': item.type, 'data-plugin': item.plugin };
  if (isPlugin) Object.assign(attrs, { id: `plugin-${item.name}`, tabindex: '-1' });
  const card = h(d, 'li', attrs);
  const front = flips ? h(d, 'div', { class: 'card-front' }) : card;
  // tokens.css already maps [data-type] to --type-color; setting it through the CSSOM keeps it explicit and CSP-safe.
  card.style?.setProperty('--type-color', `var(--type-${item.type})`);

  const head = h(
    d,
    'div',
    { class: 'card-head' },
    h(d, 'span', { class: 'badge' }, h(d, 'span', { class: 'badge-shape' }), TYPE_LABELS[item.type] ?? item.type),
    isPlugin
      ? h(
          d,
          'span',
          { class: 'meta' },
          owner ? h(d, 'span', { class: 'version' }, t('card.version', { version: owner.version })) : null,
          h(d, 'span', { class: 'category' }, item.category),
        )
      : null,
  );
  const title = highlighted(d, 'h3', { class: isPlugin ? 'card-title' : 'card-title is-mono' }, item.name, terms);
  const description = highlighted(d, 'p', { class: 'card-desc' }, truncate(item.description), terms);

  let manual = null;
  const lines = installLines(item.plugin).join('\n');
  const button = h(d, 'button', { type: 'button', class: 'copy-btn', 'data-copy': 'install', 'aria-label': t('card.copyInstallAria', { name: item.name }) }, COPY_LABEL);
  button.addEventListener('click', () =>
    copyAndAnnounce({
      text: lines,
      win,
      status,
      onManual: () => {
        if (!manual) {
          manual = h(d, 'pre', { class: 'install manual-copy' }, lines);
          front.append(h(d, 'div', { class: 'copy-fallback' }, h(d, 'p', {}, t('card.manualCopyHint')), manual));
        }
        return manual;
      },
    }),
  );

  const actionsEnd = h(d, 'div', { class: 'card-actions-end' }, button);
  const actions = h(d, 'div', { class: 'card-actions' });
  if (isPlugin) {
    const state = ctx.builder?.state(item.name) ?? { checked: false, locked: false, auto: false, parents: [] };
    const box = h(d, 'input', { type: 'checkbox', class: 'check', 'data-add-set': item.name, checked: state.checked, disabled: state.locked });
    const note = h(d, 'span', { class: 'add-set-note', id: addSetNoteId(item.name), hidden: true });
    applyAddSet(box, note, state);
    box.addEventListener('change', () => ctx.builder?.toggle(item.name, box.checked));
    actions.append(h(d, 'div', { class: 'add-set-wrap' }, h(d, 'label', { class: 'add-set' }, box, ADD_SET_LABEL), note));
  }
  actions.append(actionsEnd);

  front.append(head, title, description);
  if (isPlugin) {
    const entries = contentsEntries(ctx.contents?.get(item.name));
    if (entries.length) {
      front.append(
        h(d, 'ul', { class: 'contents', 'aria-label': t('card.contentsAria') }, ...entries.map((e) => h(d, 'li', { 'data-type': e.type }, h(d, 'span', { class: 'contents-dot' }), e.text))),
      );
    }
    const compat = owner ? compatibilityText(owner) : null;
    if (compat) front.append(h(d, 'p', { class: 'requires compat' }, compat));
    const news = owner ? whatsNew(owner) : null;
    if (news) front.append(h(d, 'p', { class: 'whats-new', title: news.note ? `${news.title} ${news.note}` : news.title }, h(d, 'b', {}, news.title), news.note ? ` ${news.note}` : null));
    const deps = owner?.dependencies ?? [];
    if (deps.length) {
      const parts = [];
      deps.forEach((dep, i) => {
        if (i > 0) parts.push(', ');
        parts.push(h(d, 'code', {}, dep.name), ' ', h(d, 'span', { class: 'range' }, dep.range));
      });
      front.append(h(d, 'p', { class: 'requires' }, `${t('card.requires')} `, ...parts));
    }
  } else {
    const chip = h(
      d,
      'a',
      { class: 'owner', href: `#plugin-${item.plugin}` },
      h(d, 'span', { class: 'owner-dot' }),
      h(d, 'span', { class: 'owner-label' }, OWNER_LABEL),
      ' ',
      highlighted(d, 'span', { class: 'plugin-name' }, item.plugin, terms),
      ' ',
      owner ? h(d, 'span', { class: 'version' }, owner.version) : null,
    );
    chip.addEventListener('click', (event) => {
      if (!ctx.reveal) return;
      event.preventDefault();
      ctx.reveal(item.plugin);
    });
    front.append(chip);
  }
  front.append(actions);
  if (flips) {
    const trust = renderTrustCost(d, owner);
    front.append(trust.bar);
    card.append(h(d, 'div', { class: 'card-inner' }, front, trust.back));
    wireFlip(card, front, trust);
  }
  return card;
}
