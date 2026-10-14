import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCurated, CuratedError } from '../../../site-src/search/curated.js';

const read = (f) => readFileSync(new URL(`../../../data/${f}`, import.meta.url), 'utf8');
const base = { dictionary: 'архітектура = architecture\n', stopUk: 'для\n', stopEn: 'the\n', typewords: 'skill: skill, скіл\n' };
const with_ = (over) => ({ ...base, ...over });

function assertCurated(texts, file, ruleRe) {
  assert.throws(
    () => parseCurated(texts),
    (e) => e instanceof CuratedError && e.file === file && ruleRe.test(e.rule) && e.message.includes(file),
  );
}

test('AC-5 curated: a duplicate dictionary key throws CuratedError(file, rule)', () => {
  assertCurated(with_({ dictionary: 'тест = test\nтест = testing\n' }), 'data/dictionary.ua-en.txt', /duplicate/);
});

test('AC-5 curated: duplicate keys that differ only by apostrophe variant are duplicates (AC-15)', () => {
  assertCurated(with_({ dictionary: "рев'ю = review\nрев’ю = check\n" }), 'data/dictionary.ua-en.txt', /duplicate/);
});

test('AC-5 curated: an empty value throws', () => {
  assertCurated(with_({ dictionary: 'тест =\n' }), 'data/dictionary.ua-en.txt', /empty|word list/);
  assertCurated(with_({ dictionary: 'тест = , ,\n' }), 'data/dictionary.ua-en.txt', /empty|word list/);
});

test('AC-5 curated: a value that is not a word list throws', () => {
  assertCurated(with_({ dictionary: 'тест = <b>test</b>\n' }), 'data/dictionary.ua-en.txt', /word list/);
  assertCurated(with_({ dictionary: 'тест = test;;rm\n' }), 'data/dictionary.ua-en.txt', /word list/);
});

test('AC-5 curated: a line without "=" or with an empty key throws', () => {
  assertCurated(with_({ dictionary: 'просто слово\n' }), 'data/dictionary.ua-en.txt', /word = /);
  assertCurated(with_({ dictionary: ' = test\n' }), 'data/dictionary.ua-en.txt', /key/);
});

test('AC-5 curated: typewords reject an unknown type and a form claimed by two types', () => {
  assertCurated(with_({ typewords: 'widget: widget\n' }), 'data/typewords.txt', /unknown type/);
  assertCurated(with_({ typewords: 'skill: dup\nagent: dup\n' }), 'data/typewords.txt', /duplicate/);
});

test('curated: comments and blank lines are ignored; keys, stop words and forms are normalised', () => {
  const c = parseCurated({
    dictionary: "# comment\n\nРев’ю = Review # trailing\n",
    stopUk: '# c\nДля\n',
    stopEn: 'The\n',
    typewords: 'skill: Скіл, skills\n',
  });
  assert.deepEqual(c.dictionary.get("рев'ю"), ['review']);
  assert.ok(c.stop.has('для') && c.stop.has('the'));
  assert.equal(c.typeForms.get('скіл'), 'skill');
  assert.equal(c.typeForms.get('skills'), 'skill');
});

test('the real data files parse and cover the domain words the spec needs', () => {
  const c = parseCurated({
    dictionary: read('dictionary.ua-en.txt'),
    stopUk: read('stopwords.uk.txt'),
    stopEn: read('stopwords.en.txt'),
    typewords: read('typewords.txt'),
  });
  assert.ok(c.dictionary.size >= 60, `dictionary has ${c.dictionary.size} entries`);
  assert.ok(c.stop.size >= 100);
  assert.deepEqual(c.dictionary.get("рев'ю"), ['review']);
  assert.ok(c.dictionary.get('архітектури').includes('architecture'));
  for (const t of ['skill', 'agent', 'command', 'hook', 'mcp_server', 'plugin']) {
    assert.ok([...c.typeForms.values()].includes(t), `type ${t} has forms`);
  }
});

test('the real data: no type form or dictionary key is also a stop word', () => {
  const c = parseCurated({
    dictionary: read('dictionary.ua-en.txt'),
    stopUk: read('stopwords.uk.txt'),
    stopEn: read('stopwords.en.txt'),
    typewords: read('typewords.txt'),
  });
  for (const k of c.dictionary.keys()) assert.ok(!c.stop.has(k), `dictionary key "${k}" is a stop word`);
  for (const k of c.typeForms.keys()) assert.ok(!c.stop.has(k), `type form "${k}" is a stop word`);
});
