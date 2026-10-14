// Trust profile and context cost of one plugin, as plain text inside one <details> (AC-36, AC-39).
// Every value is a text node; URLs are never links. Flags state facts and carry no verdict.
import { h } from './safe-dom.js';
import { TRUST_NOTICE, describeTrust, describeFacts, trustRows } from './trust-text.js';
import { COST_NOTICE, describeCost } from './cost-text.js';

export const DETAILS_SUMMARY = 'Trust and cost';

const EMPTY_TRUST = { hooks: [], mcp_servers: [], has_scripts: false, network_urls: [] };
const EMPTY_COST = { always_loaded_tokens: 0, on_invocation_tokens: 0 };

export function renderTrustCost(doc, plugin) {
  const rawTrust = plugin.trust ?? EMPTY_TRUST;
  const trust = describeTrust(rawTrust);
  const cost = describeCost(plugin.cost ?? EMPTY_COST);
  const urls = rawTrust.network_urls ?? [];
  const rows = trustRows(rawTrust);

  const trustBlock = h(
    doc,
    'div',
    { class: 'trust' },
    h(doc, 'p', { class: 'trust-title' }, 'Trust profile'),
    h(doc, 'p', { class: 'trust-notice' }, TRUST_NOTICE),
    h(doc, 'p', { class: 'trust-sentence' }, trust.sentence),
    rows.length
      ? h(
          doc,
          'ul',
          { class: 'trust-rows' },
          ...rows.map((row) =>
            h(
              doc,
              'li',
              { class: 'trust-row' },
              h(doc, 'span', { class: 'trust-row-desc' }, row.text),
              row.flags.length ? h(doc, 'span', { class: 'flags' }, ...row.flags.map((f) => h(doc, 'span', { class: 'flag' }, f))) : null,
            ),
          ),
        )
      : null,
    urls.length
      ? h(
          doc,
          'div',
          { class: 'trust-urls' },
          h(doc, 'p', {}, 'Network URLs in hook and MCP configuration (text only):'),
          h(doc, 'ul', { class: 'trust-url-list' }, ...urls.map((u) => h(doc, 'li', {}, h(doc, 'code', {}, u)))),
        )
      : null,
  );

  const costBlock = h(
    doc,
    'div',
    { class: 'cost' },
    h(doc, 'p', { class: 'cost-title' }, 'Context cost'),
    h(doc, 'div', { class: 'cost-figures' }, ...cost.lines.map((line) => h(doc, 'p', { class: 'cost-figure' }, line))),
    h(doc, 'p', { class: 'cost-notice' }, COST_NOTICE),
  );

  return h(
    doc,
    'details',
    { class: 'trust-cost' },
    h(doc, 'summary', {}, h(doc, 'b', {}, DETAILS_SUMMARY), ' ', h(doc, 'span', { class: 'summary-facts' }, describeFacts(rawTrust, plugin.cost ?? EMPTY_COST))),
    h(doc, 'div', { class: 'trust-body' }, trustBlock, costBlock),
  );
}
