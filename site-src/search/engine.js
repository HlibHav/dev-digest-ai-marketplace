// MiniSearch engine: fuzzy + prefix matching, AND across query tokens, OR across a token's translations.
// Isomorphic: no node:* imports, no DOM access. Query text is data: it is tokenised, never compiled.
import MiniSearch from 'minisearch';
import { buildDocs } from './docs.js';
import { normalizeApostrophes } from './normalize.js';
import { parseQuery } from './parse-query.js';

// Index and query side share one tokenizer so an apostrophe splits the same way on both.
const indexTokenize = (s) => normalizeApostrophes(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const FIELDS = ['name', 'description', 'tags', 'body'];
const BOOST = { name: 3, description: 2, tags: 2, body: 1 };
const FUZZY = 0.2;
const MIN_FUZZY_LENGTH = 4;

const byName = (a, b) => a.name.localeCompare(b.name, 'en') || a.plugin.localeCompare(b.plugin, 'en') || a.id.localeCompare(b.id, 'en');

/** One expansion becomes a string, or an AND of its words when it holds several. */
function leaf(expansion) {
  const toks = indexTokenize(expansion);
  if (toks.length === 0) return null;
  return toks.length === 1 ? toks[0] : { combineWith: 'AND', queries: toks };
}

/** Query tree: AND over tokens, OR over each token's expansions. */
function buildTree(groups) {
  const ands = [];
  for (const group of groups) {
    const ors = group.map(leaf).filter((l) => l !== null);
    if (ors.length === 0) continue;
    ands.push({ combineWith: 'OR', queries: ors });
  }
  return ands.length === 0 ? null : { combineWith: 'AND', queries: ands };
}

/** @returns {{search(raw: string): {state: string, interpretation: {types: string[], terms: string[]}, hits: {doc: object, score: number, terms: string[]}[]}}} */
export function createSearch(index, curated) {
  const docs = buildDocs(index);
  const byId = new Map(docs.map((d) => [d.id, d]));
  const mini = new MiniSearch({
    idField: 'id',
    fields: FIELDS,
    storeFields: ['type'],
    tokenize: indexTokenize,
    processTerm: (t) => normalizeApostrophes(t).toLowerCase(),
    extractField: (doc, field) => {
      const v = doc[field];
      return Array.isArray(v) ? v.join(' ') : v;
    },
  });
  mini.addAll(docs);

  const sortedByName = [...docs].sort(byName);

  function search(raw) {
    const q = parseQuery(raw, curated);
    const interpretation = { types: q.types, terms: q.terms };
    if (q.state === 'empty-query') {
      return { state: 'empty-query', interpretation, hits: docs.map((doc) => ({ doc, score: 0, terms: [] })) };
    }
    const typeOk = (type) => q.types.length === 0 || q.types.includes(type);
    if (q.state === 'type-listing') {
      const hits = sortedByName.filter((d) => typeOk(d.type)).map((doc) => ({ doc, score: 0, terms: [] }));
      return { state: 'type-listing', interpretation, hits };
    }
    const tree = buildTree(q.groups);
    const raws = tree
      ? mini.search(tree, {
          prefix: true,
          fuzzy: (term) => (term.length < MIN_FUZZY_LENGTH ? false : FUZZY),
          boost: BOOST,
          filter: (r) => typeOk(r.type),
        })
      : [];
    const hits = raws
      .map((r) => ({ doc: byId.get(r.id), score: r.score, terms: r.terms }))
      .sort((a, b) => b.score - a.score || byName(a.doc, b.doc));
    return { state: hits.length > 0 ? 'results' : 'no-results', interpretation, hits };
  }

  return { search };
}
