// Plain-text rendering of a plugin's context-cost estimate.
export const COST_NOTICE =
  'Estimates only. Method: characters ÷ 4, rounded up. Excluded: hook output, MCP tool descriptions and results.';
export const COST_EMPTY = '0 tokens (no loaded content)';

const fmt = (n) => n.toLocaleString('en-US');

export function describeCost(cost) {
  if (!cost.always_loaded_tokens && !cost.on_invocation_tokens) {
    return { empty: true, lines: [COST_EMPTY] };
  }
  return {
    empty: false,
    lines: [
      `Always loaded: about ${fmt(cost.always_loaded_tokens)} tokens (estimate)`,
      `Loaded on invocation: about ${fmt(cost.on_invocation_tokens)} tokens (estimate)`,
    ],
  };
}
