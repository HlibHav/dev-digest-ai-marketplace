// Context-cost estimate (AC-38, AC-40): characters / 4, rounded up. An estimate, not a tokenizer.

export const COST_METHOD = 'characters / 4, rounded up';
export const COST_EXCLUDED = Object.freeze(['hook output', 'MCP tool descriptions and results']);
const LOADED_TYPES = new Set(['skill', 'agent', 'command']);

export const estimateTokens = (chars) => Math.ceil(chars / 4);

const shortOf = (a) => a.short_name ?? String(a.name).replace(/^\/?[^:/]+:/, '');

/**
 * buildCost(artifacts) -> cost
 * Always loaded: per skill, agent and command, ceil((short name + description) / 4).
 * On invocation: per skill, agent and command, ceil(full body / 4). Hooks and MCP servers cost nothing here.
 */
export function buildCost(artifacts) {
  let always = 0;
  let onInvocation = 0;
  for (const a of artifacts) {
    if (!LOADED_TYPES.has(a.type)) continue;
    always += estimateTokens(shortOf(a).length + (a.description ?? '').length);
    onInvocation += estimateTokens((a.body ?? '').length);
  }
  return {
    always_loaded_tokens: always,
    on_invocation_tokens: onInvocation,
    method: COST_METHOD,
    excluded: [...COST_EXCLUDED],
  };
}
