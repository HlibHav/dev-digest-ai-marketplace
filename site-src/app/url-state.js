// URL <-> UI state. The query string is untrusted input: bounded, validated, never evaluated.
import { TYPES, MAX_QUERY } from '../contract/index-contract.js';

const MAX_LIST = 100;
const PLUGIN_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

const capQuery = (q) => Array.from(String(q ?? '')).slice(0, MAX_QUERY).join('');
const unique = (list) => [...new Set(list)];

/**
 * Reads `?q=&type=&type=&plugins=a,b`.
 * `knownPlugins` (optional iterable of names) drops unknown plugins; without it only well-formed names are kept.
 */
export function readState(search, knownPlugins) {
  const params = new URLSearchParams(String(search ?? ''));
  const q = capQuery(params.get('q'));
  const types = unique(params.getAll('type').filter((t) => TYPES.includes(t)));
  const known = knownPlugins ? new Set(knownPlugins) : null;
  const names = (params.get('plugins') ?? '').split(',').filter((n) => PLUGIN_NAME.test(n));
  const plugins = unique(known ? names.filter((n) => known.has(n)) : names).slice(0, MAX_LIST);
  return { q, types, plugins };
}

/** Returns a query string with the leading `?`, or '' when the state is empty. */
export function writeState(state) {
  const params = new URLSearchParams();
  const q = capQuery(state.q);
  if (q) params.set('q', q);
  for (const t of unique(state.types ?? [])) if (TYPES.includes(t)) params.append('type', t);
  const plugins = unique(state.plugins ?? []).filter((n) => PLUGIN_NAME.test(n)).slice(0, MAX_LIST);
  if (plugins.length) params.set('plugins', plugins.join(','));
  const out = params.toString();
  return out ? `?${out}` : '';
}
