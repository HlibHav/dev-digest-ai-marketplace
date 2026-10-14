// Turns the raw query text into an interpretation: type filter, text terms and UA->EN expansions.
// Isomorphic: no node:* imports, no DOM access. Query text is data and never becomes a RegExp.
import { MAX_QUERY } from '../contract/index-contract.js';
import { normalizeApostrophes, tokenize } from './normalize.js';

/** Cuts the query to MAX_QUERY characters (code points, so a surrogate pair is never split). */
export function clampQuery(raw) {
  const s = typeof raw === 'string' ? raw : '';
  if (s.length <= MAX_QUERY) return s;
  return Array.from(s).slice(0, MAX_QUERY).join('');
}

/**
 * @returns {{
 *   raw: string, tokens: string[], types: string[], terms: string[],
 *   expansions: Record<string,string[]>, groups: string[][],
 *   state: 'empty-query'|'type-listing'|'results'
 * }}
 * `tokens`: query words left after stop-word removal (AC-12).
 * `types`: type filter from type words (AC-13).
 * `terms`: the text terms for display; a token with a dictionary entry shows its first English translation.
 * `expansions[token]`: [token, ...translations] (AC-14); `groups` is the same lists in query order.
 * Text terms combine with AND, each group's members with OR.
 */
export function parseQuery(raw, curated) {
  const clamped = clampQuery(raw);
  const tokens = tokenize(clamped).filter((t) => !curated.stop.has(t));
  const types = [];
  const terms = [];
  const expansions = Object.create(null);
  const groups = [];
  for (const tok of tokens) {
    const type = curated.typeForms.get(tok);
    if (type) {
      if (!types.includes(type)) types.push(type);
      continue;
    }
    const translations = curated.dictionary.get(tok) ?? [];
    const group = [tok, ...translations.filter((t) => t !== tok)];
    if (!(tok in expansions)) expansions[tok] = group;
    groups.push(expansions[tok]);
    terms.push(translations[0] ?? tok);
  }
  const state = terms.length > 0 ? 'results' : types.length > 0 ? 'type-listing' : 'empty-query';
  return { raw: normalizeApostrophes(clamped), tokens, types, terms, expansions, groups, state };
}
