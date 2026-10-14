import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCurated } from '../../../site-src/search/curated.js';
import { buildDocs, createSearch } from '../../../site-src/search/index.js';
import { assertIndexShape } from '../../../site-src/contract/index-contract.js';

const read = (f) => readFileSync(new URL(`../../../data/${f}`, import.meta.url), 'utf8');
const curated = parseCurated({
  dictionary: read('dictionary.ua-en.txt'),
  stopUk: read('stopwords.uk.txt'),
  stopEn: read('stopwords.en.txt'),
  typewords: read('typewords.txt'),
});

const trust = { hooks: [], mcp_servers: [], has_scripts: false, network_urls: [] };
const cost = { always_loaded_tokens: 0, on_invocation_tokens: 0, method: 'estimate', excluded: [] };
const plugin = (name, description, tags = [], category = 'dev') => ({
  name, version: '1.0.0', description, category, tags, dependencies: [], install_commands: [], trust, cost,
});
const art = (type, name, plugin, description, body = '') => ({
  type, name, plugin, description, body_excerpt: body, source_path: `plugins/${plugin}/${name}`, install_commands: [],
});

const index = {
  schema_version: 1,
  marketplace: 'dev-digest-ai-marketplace',
  plugins: [
    plugin('alpha', 'Tools for architecture work', ['design']),
    plugin('beta', 'Release helpers'),
    plugin('gamma', 'Misc'),
  ],
  artifacts: [
    art('skill', 'architecture-review', 'alpha', 'Architecture review of a codebase', 'Walks the module graph.'),
    art('skill', 'bodyonly', 'alpha', 'Something unrelated', 'This body mentions architecture once.'),
    art('skill', 'zeta-skill', 'beta', 'Helps with releases'),
    art('agent', 'reviewer', 'alpha', 'Reviews pull requests'),
    art('agent', 'builder', 'beta', 'Builds things'),
    art('agent', 'architect', 'gamma', 'Plans architecture'),
    art('command', 'deploy', 'beta', 'Deploys the app'),
    art('hook', 'beta/PreToolUse#0', 'beta', 'PreToolUse hook running guard.sh'),
    art('mcp_server', 'docs', 'gamma', 'command MCP server npx docs'),
    art('skill', 'rev', 'alpha', 'Short name review helper'),
  ],
};
assertIndexShape(index);

const s = createSearch(index, curated);
const names = (r) => r.hits.map((h) => h.doc.name);

test('buildDocs: plugin documents come from plugins[], artifacts carry plugin tags and category', () => {
  const docs = buildDocs(index);
  const plugins = docs.filter((d) => d.type === 'plugin');
  assert.deepEqual(plugins.map((d) => d.name), ['alpha', 'beta', 'gamma']);
  assert.equal(plugins[0].description, 'Tools for architecture work');
  assert.deepEqual(plugins[0].tags, ['design']);
  const sk = docs.find((d) => d.name === 'architecture-review');
  assert.equal(sk.plugin, 'alpha');
  assert.equal(sk.body, 'Walks the module graph.');
  assert.deepEqual(sk.tags, ['design']);
  assert.equal(sk.category, 'dev');
  assert.equal(new Set(docs.map((d) => d.id)).size, docs.length);
  assert.equal(docs.length, 3 + index.artifacts.length);
});

test('buildDocs: an artifact of type plugin in artifacts[] does not duplicate the plugin document', () => {
  const dup = structuredClone(index);
  dup.artifacts.push(art('plugin', 'alpha', 'alpha', 'dup'));
  assert.equal(buildDocs(dup).filter((d) => d.type === 'plugin').length, 3);
});

test('buildDocs: colliding ids still produce unique documents', () => {
  const dup = structuredClone(index);
  dup.artifacts.push(art('skill', 'zeta-skill', 'beta', 'same name again'));
  const docs = buildDocs(dup);
  assert.equal(new Set(docs.map((d) => d.id)).size, docs.length);
  assert.doesNotThrow(() => createSearch(dup, curated));
});

test('AC-16: name beats body', () => {
  const r = s.search('architecture');
  assert.equal(r.state, 'results');
  const order = names(r);
  assert.ok(order.indexOf('architecture-review') < order.indexOf('bodyonly'), order.join(','));
  assert.ok(order.includes('bodyonly'));
});

test('AC-16: architectur (prefix) and architecure (typo) both return the architecture fixture', () => {
  for (const q of ['architectur', 'architecure']) {
    const r = s.search(q);
    assert.ok(names(r).includes('architecture-review'), `${q}: ${names(r)}`);
  }
});

test('AC-16: fuzzy is off for tokens under 4 chars, so "rex" does not hit "rev"', () => {
  assert.equal(s.search('rex').state, 'no-results');
  assert.ok(names(s.search('rev')).includes('rev'));
});

test('AC-14: a Ukrainian query with a dictionary word returns the architecture skill', () => {
  const r = s.search("скіл для рев'ю архітектури");
  assert.deepEqual(r.interpretation, { types: ['skill'], terms: ['review', 'architecture'] });
  assert.equal(r.state, 'results');
  assert.deepEqual(names(r).slice(0, 1), ['architecture-review']);
  assert.ok(r.hits.every((h) => h.doc.type === 'skill'));
});

test("AC-15: рев'ю, рев’ю and ревʼю give identical results", () => {
  const a = s.search("рев'ю");
  assert.deepEqual(s.search('рев’ю'), a);
  assert.deepEqual(s.search('ревʼю'), a);
  assert.ok(a.hits.length > 0);
});

test('tokens combine with AND, a token translations with OR', () => {
  assert.deepEqual(names(s.search('deploy release')), []);
  const r = s.search('architecture helper');
  assert.deepEqual(names(r), []);
  assert.ok(names(s.search('архітектура')).includes('architect'));
  assert.deepEqual(names(s.search('release helpers')).slice(0, 1), ['beta']);
});

test('AC-13: the type filter limits results to the type', () => {
  const r = s.search('agent architecture');
  assert.deepEqual(names(r), ['architect']);
});

test('AC-17: type-only query lists all agents ordered by name', () => {
  const r = s.search('агенти');
  assert.equal(r.state, 'type-listing');
  assert.deepEqual(names(r), ['architect', 'builder', 'reviewer']);
  assert.deepEqual(r.interpretation, { types: ['agent'], terms: [] });
});

test('AC-17: several type words list the union of both types', () => {
  const r = s.search('агенти команди');
  assert.deepEqual(names(r), ['architect', 'builder', 'deploy', 'reviewer']);
});

test('AC-17: "плагіни" lists the plugins from plugins[]', () => {
  assert.deepEqual(names(s.search('плагіни')), ['alpha', 'beta', 'gamma']);
});

test('AC-18: punctuation-only query is the empty state', () => {
  const r = s.search('!!! ???');
  assert.equal(r.state, 'empty-query');
  assert.deepEqual(r.interpretation, { types: [], terms: [] });
});

test('AC-18: stop-words-only query is the empty state and lists the full catalog', () => {
  const r = s.search('для і на');
  assert.equal(r.state, 'empty-query');
  assert.equal(r.hits.length, 3 + index.artifacts.length);
  assert.equal(s.search('').state, 'empty-query');
});

test('AC-19: "skill zzzzqq" is no-results with the interpretation restated', () => {
  const r = s.search('skill zzzzqq');
  assert.equal(r.state, 'no-results');
  assert.deepEqual(r.hits, []);
  assert.deepEqual(r.interpretation, { types: ['skill'], terms: ['zzzzqq'] });
});

test('AC-11: one query finds a plugin, a skill and an agent', () => {
  const r = s.search('architecture');
  const types = new Set(r.hits.map((h) => h.doc.type));
  for (const t of ['plugin', 'skill', 'agent']) assert.ok(types.has(t), t);
});

test('hits carry doc, a positive score and the matched terms for highlighting', () => {
  const h = s.search('deploy').hits[0];
  assert.equal(h.doc.name, 'deploy');
  assert.ok(h.score > 0);
  assert.ok(h.terms.includes('deploy'));
});

test('ordering is deterministic: equal scores sort by name', () => {
  const a = names(s.search('misc'));
  assert.deepEqual(names(s.search('misc')), a);
});

test('AC-23: a 10 000-char query finishes quickly and returns a valid state', () => {
  const t0 = performance.now();
  const r = s.search('a'.repeat(10000));
  assert.ok(performance.now() - t0 < 500);
  assert.ok(['results', 'no-results'].includes(r.state));
  assert.equal(r.interpretation.terms[0].length, 200);
});

test('AC-24: markup and regexp characters in the query are plain data', () => {
  for (const q of ['<script>', '(', '[a-', '.*', '\\']) {
    assert.doesNotThrow(() => s.search(q), q);
  }
});

test('an empty index returns no-results for text and empty hits for a type', () => {
  const e = createSearch({ ...index, plugins: [], artifacts: [] }, curated);
  assert.equal(e.search('anything').state, 'no-results');
  assert.equal(e.search('агенти').hits.length, 0);
  assert.equal(e.search('').state, 'empty-query');
});
