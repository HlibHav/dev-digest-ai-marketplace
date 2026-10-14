import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCurated } from '../../../site-src/search/curated.js';
import { parseQuery, clampQuery } from '../../../site-src/search/parse-query.js';
import { normalizeApostrophes, tokenize } from '../../../site-src/search/normalize.js';
import { MAX_QUERY } from '../../../site-src/contract/index-contract.js';

const read = (f) => readFileSync(new URL(`../../../data/${f}`, import.meta.url), 'utf8');
const curated = parseCurated({
  dictionary: read('dictionary.ua-en.txt'),
  stopUk: read('stopwords.uk.txt'),
  stopEn: read('stopwords.en.txt'),
  typewords: read('typewords.txt'),
});

test('AC-12: stop and filler words are removed before matching', () => {
  const q = parseQuery("мені треба скіл для рев'ю архітектури", curated);
  assert.deepEqual(q.tokens, ['скіл', "рев'ю", 'архітектури']);
});

test('AC-13: a type word becomes a type filter, not a text term', () => {
  const q = parseQuery("скіл для рев'ю архітектури", curated);
  assert.deepEqual(q.types, ['skill']);
  assert.deepEqual(q.terms, ['review', 'architecture']);
  assert.equal(q.state, 'results');
});

test('AC-13: inflected forms скіли, скіла, агенти each map to a type', () => {
  assert.deepEqual(parseQuery('скіли', curated).types, ['skill']);
  assert.deepEqual(parseQuery('скіла', curated).types, ['skill']);
  assert.deepEqual(parseQuery('агенти', curated).types, ['agent']);
  for (const [w, t] of [['команди', 'command'], ['хуки', 'hook'], ['mcp', 'mcp_server'], ['плагіни', 'plugin'], ['plugin', 'plugin'], ['Skills', 'skill']]) {
    assert.deepEqual(parseQuery(w, curated).types, [t], w);
  }
});

test('AC-13: several type words collect several types without duplicates', () => {
  assert.deepEqual(parseQuery('скіл агент скіли', curated).types, ['skill', 'agent']);
});

test("AC-15: рев'ю, рев’ю and ревʼю give identical tokens and interpretation", () => {
  const a = parseQuery("рев'ю", curated);
  const b = parseQuery('рев’ю', curated);
  const c = parseQuery('ревʼю', curated);
  assert.deepEqual(a, b);
  assert.deepEqual(a, c);
  assert.deepEqual(a.terms, ['review']);
  assert.equal(normalizeApostrophes('рев’ю ревʼю'), "рев'ю рев'ю");
  assert.deepEqual(tokenize('рев’ю'), ["рев'ю"]);
});

test('tokenize: lowercases, splits on punctuation, keeps inner apostrophes, drops bare ones', () => {
  assert.deepEqual(tokenize("Hello, WORLD! -- don't ' ''"), ['hello', 'world', "don't"]);
  assert.deepEqual(tokenize('!!! ??? ...'), []);
});

test('AC-14: the dictionary expands архітектури and keeps the original token', () => {
  const q = parseQuery('архітектури', curated);
  assert.deepEqual(q.expansions['архітектури'].slice(0, 2), ['архітектури', 'architecture']);
  assert.deepEqual(q.groups, [q.expansions['архітектури']]);
  const r = parseQuery("рев'ю", curated);
  assert.deepEqual(r.expansions["рев'ю"], ["рев'ю", 'review']);
});

test('AC-14: mixed script "agent для review" works; Latin terms expand to themselves', () => {
  const q = parseQuery('agent для review', curated);
  assert.deepEqual(q.types, ['agent']);
  assert.deepEqual(q.terms, ['review']);
  assert.deepEqual(q.expansions.review, ['review']);
});

test('AC-14: an inflected Ukrainian word missing from the dictionary has no translation', () => {
  const q = parseQuery('зздрвпмщ', curated);
  assert.deepEqual(q.expansions['зздрвпмщ'], ['зздрвпмщ']);
  assert.deepEqual(q.terms, ['зздрвпмщ']);
});

test('AC-12/AC-18: punctuation-only and stop-word-only queries are empty-query', () => {
  for (const raw of ['', '   ', '!!! ???', 'для і на', 'the of a']) {
    const q = parseQuery(raw, curated);
    assert.equal(q.state, 'empty-query', JSON.stringify(raw));
    assert.deepEqual(q.types, []);
    assert.deepEqual(q.terms, []);
  }
});

test('AC-17: only type words give type-listing', () => {
  const q = parseQuery('агенти', curated);
  assert.equal(q.state, 'type-listing');
  assert.deepEqual(q.types, ['agent']);
});

test('AC-23: clampQuery cuts a 10 000-char query to 200 and parseQuery uses it', () => {
  const long = 'a'.repeat(10000);
  assert.equal(MAX_QUERY, 200);
  assert.equal(clampQuery(long).length, 200);
  assert.equal(clampQuery(' x ').length, 3);
  assert.deepEqual(parseQuery(long, curated).terms, ['a'.repeat(200)]);
  assert.equal(clampQuery(undefined), '');
  assert.equal(clampQuery(null), '');
});

test('AC-24: query text is only data: markup characters become plain tokens', () => {
  const q = parseQuery('<script>alert(1)</script>', curated);
  assert.deepEqual(q.terms, ['script', 'alert', '1', 'script']);
});
