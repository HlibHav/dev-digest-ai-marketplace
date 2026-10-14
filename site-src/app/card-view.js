// One result card (AC-20) with a copy-install button (AC-21, AC-59). Built with safe-dom only.
import { h } from './safe-dom.js';
import { highlightRanges, appendHighlighted } from './highlight.js';
import { MARKETPLACE, REPO } from '../contract/index-contract.js';
import { copyAndAnnounce } from './status.js';
import { renderTrustCost } from './trust-view.js';

export const TYPE_LABELS = Object.freeze({
  plugin: 'plugin',
  skill: 'skill',
  agent: 'agent',
  command: 'command',
  hook: 'hook',
  mcp_server: 'MCP server',
});
export const DESCRIPTION_LIMIT = 280;
export const COPY_LABEL = 'Copy install';

/** The two lines AC-21 puts on the clipboard: the marketplace must be added before the plugin installs. */
export function installLines(pluginName) {
  return [`/plugin marketplace add ${REPO}`, `/plugin install ${pluginName}@${MARKETPLACE}`];
}

/** Cuts `text` to `limit` characters (code points) and marks the cut with an ellipsis. */
export function truncate(text, limit = DESCRIPTION_LIMIT) {
  const chars = Array.from(String(text ?? ''));
  return chars.length <= limit ? chars.join('') : `${chars.slice(0, limit).join('').trimEnd()}…`;
}

function highlighted(doc, tag, attrs, text, terms) {
  const el = h(doc, tag, attrs);
  appendHighlighted(el, text, highlightRanges(text, terms));
  return el;
}

/**
 * ctx: {doc, win, status, plugins: Map<name, plugin>}.
 * hit: {doc, score, terms[]}; extraTerms: interpreted query terms to highlight as well.
 */
export function createCard(ctx, hit, extraTerms = []) {
  const { doc: d, win, status, plugins } = ctx;
  const item = hit.doc;
  const terms = [...new Set([...(hit.terms ?? []), ...extraTerms])];
  const owner = plugins.get(item.plugin);
  const isPlugin = item.type === 'plugin';

  const card = h(d, 'li', { class: 'card', 'data-card': '', 'data-type': item.type, 'data-plugin': item.plugin });
  // tokens.css already maps [data-type] to --type-color; setting it through the CSSOM keeps it explicit and CSP-safe.
  card.style?.setProperty('--type-color', `var(--type-${item.type})`);

  const head = h(
    d,
    'div',
    { class: 'card-head' },
    h(d, 'span', { class: 'badge' }, TYPE_LABELS[item.type] ?? item.type),
    highlighted(d, 'h3', { class: 'card-title' }, item.name, terms),
    isPlugin && owner ? h(d, 'span', { class: 'version' }, `v${owner.version}`) : null,
  );

  const meta = isPlugin
    ? h(d, 'p', { class: 'meta' }, 'Category: ', h(d, 'span', { class: 'category' }, item.category))
    : h(d, 'p', { class: 'meta' }, 'Plugin: ', highlighted(d, 'span', { class: 'owner' }, item.plugin, terms));

  const description = highlighted(d, 'p', { class: 'card-desc' }, truncate(item.description), terms);

  let manual = null;
  const lines = installLines(item.plugin).join('\n');
  const button = h(d, 'button', { type: 'button', class: 'copy-btn', 'data-copy': 'install', 'aria-label': `${COPY_LABEL} commands for ${item.name}` }, COPY_LABEL);
  button.addEventListener('click', () =>
    copyAndAnnounce({
      text: lines,
      win,
      status,
      onManual: () => {
        if (!manual) {
          manual = h(d, 'pre', { class: 'install manual-copy' }, lines);
          card.append(manual);
        }
        return manual;
      },
    }),
  );

  card.append(head, meta, description, h(d, 'div', { class: 'card-actions' }, button));
  if (isPlugin && owner) card.append(renderTrustCost(d, owner));
  return card;
}
