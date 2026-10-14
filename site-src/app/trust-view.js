// Trust profile and context cost of one plugin, as plain text inside a <details> (AC-36, AC-39).
// Every value is a text node; URLs are never links.
import { h } from './safe-dom.js';
import { TRUST_NOTICE, describeTrust } from './trust-text.js';
import { COST_NOTICE, describeCost } from './cost-text.js';

export const DETAILS_SUMMARY = 'Trust profile and context cost';

const list = (doc, className, items, wrap) =>
  h(doc, 'ul', { class: className }, ...items.map((item) => h(doc, 'li', {}, wrap ? wrap(item) : item)));

export function renderTrustCost(doc, plugin) {
  const trust = describeTrust(plugin.trust ?? { hooks: [], mcp_servers: [], has_scripts: false, network_urls: [] });
  const cost = describeCost(plugin.cost ?? { always_loaded_tokens: 0, on_invocation_tokens: 0 });
  const urls = plugin.trust?.network_urls ?? [];
  return h(
    doc,
    'details',
    { class: 'trust-cost' },
    h(doc, 'summary', {}, DETAILS_SUMMARY),
    h(doc, 'p', { class: 'trust-title' }, h(doc, 'strong', {}, 'Trust profile')),
    h(doc, 'p', { class: 'trust-notice' }, TRUST_NOTICE),
    h(doc, 'p', { class: 'trust-sentence' }, trust.sentence),
    trust.lines.length ? list(doc, 'trust-lines', trust.lines) : null,
    urls.length
      ? h(
          doc,
          'div',
          { class: 'trust-urls' },
          h(doc, 'p', {}, 'Network URLs in hook and MCP configuration (text only):'),
          list(doc, 'trust-url-list', urls, (u) => h(doc, 'code', {}, u)),
        )
      : null,
    h(doc, 'p', { class: 'cost-title' }, h(doc, 'strong', {}, 'Context cost')),
    list(doc, 'cost-lines', cost.lines),
    h(doc, 'p', { class: 'cost-notice' }, COST_NOTICE),
  );
}
