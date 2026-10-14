// Trust profile and context cost of one plugin, as plain text on the back of the card (AC-36, AC-39, AC-60).
// Every value is a text node; URLs are never links. Flags state facts and carry no verdict.
import { h } from './safe-dom.js';
import { TRUST_NOTICE, describeTrust, describeFacts, trustRows } from './trust-text.js';
import { COST_NOTICE, describeCost } from './cost-text.js';
import { t } from '../i18n/t.js';

export const DETAILS_SUMMARY = t('trust.summary');

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
    h(doc, 'p', { class: 'trust-title' }, t('trust.title')),
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
          h(doc, 'p', {}, t('trust.networkUrls')),
          h(doc, 'ul', { class: 'trust-url-list' }, ...urls.map((u) => h(doc, 'li', {}, h(doc, 'code', {}, u)))),
        )
      : null,
  );

  const costBlock = h(
    doc,
    'div',
    { class: 'cost' },
    h(doc, 'p', { class: 'cost-title' }, t('cost.title')),
    h(doc, 'div', { class: 'cost-figures' }, ...cost.lines.map((line) => h(doc, 'p', { class: 'cost-figure' }, line))),
    h(doc, 'p', { class: 'cost-notice' }, COST_NOTICE),
  );

  const name = plugin.name;
  const backId = `trust-back-${name}`;
  const trigger = h(
    doc,
    'button',
    { type: 'button', class: 'trust-toggle', 'aria-expanded': 'false', 'aria-controls': backId },
    h(doc, 'b', {}, DETAILS_SUMMARY),
    ' ',
    h(doc, 'span', { class: 'summary-facts' }, describeFacts(rawTrust, plugin.cost ?? EMPTY_COST)),
  );
  const bar = h(doc, 'div', { class: 'trust-cost' }, trigger);
  const backButton = h(doc, 'button', { type: 'button', class: 'back-btn' }, t('trust.back'));
  const back = h(
    doc,
    'div',
    { class: 'card-back', id: backId },
    h(doc, 'div', { class: 'back-head' }, backButton, h(doc, 'span', { class: 'back-title' }, name)),
    h(
      doc,
      'div',
      { class: 'back-body', role: 'region', tabindex: '0', 'aria-label': t('trust.bodyAria', { name }) },
      h(doc, 'div', { class: 'trust-body' }, trustBlock, costBlock),
    ),
  );
  // The face that is turned away is inert, so tab order and assistive technology only see the visible one.
  back.setAttribute('inert', '');
  back.setAttribute('aria-hidden', 'true');
  return { bar, trigger, back, backButton };
}

/**
 * Wires the flip: the trigger turns the card to its back, "Back" and Escape turn it again.
 * `front` is the face that holds the trigger. State lives in card[data-flipped]; CSS does the turning.
 */
export function wireFlip(card, front, { trigger, back, backButton }) {
  const flipped = () => card.hasAttribute('data-flipped');
  const show = (face, on) => {
    if (on) {
      face.removeAttribute('inert');
      face.removeAttribute('aria-hidden');
    } else {
      face.setAttribute('inert', '');
      face.setAttribute('aria-hidden', 'true');
    }
  };
  const set = (on) => {
    if (on === flipped()) return;
    if (on) {
      show(back, true);
      card.setAttribute('data-flipped', '');
      trigger.setAttribute('aria-expanded', 'true');
      backButton.focus({ preventScroll: true });
      show(front, false);
    } else {
      show(front, true);
      card.removeAttribute('data-flipped');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.focus({ preventScroll: true });
      show(back, false);
    }
  };
  trigger.addEventListener('click', () => set(!flipped()));
  backButton.addEventListener('click', () => set(false));
  back.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    set(false);
  });
}
