// Plain-text rendering of a plugin's context-cost estimate.
import { t } from '../i18n/t.js';
export const COST_NOTICE = t('cost.notice');
export const COST_EMPTY = t('cost.empty');

const fmt = (n) => n.toLocaleString(t('meta.locale'));

export function describeCost(cost) {
  if (!cost.always_loaded_tokens && !cost.on_invocation_tokens) {
    return { empty: true, lines: [COST_EMPTY] };
  }
  return {
    empty: false,
    lines: [
      t('cost.always', { tokens: fmt(cost.always_loaded_tokens) }),
      t('cost.onInvocation', { tokens: fmt(cost.on_invocation_tokens) }),
    ],
  };
}
