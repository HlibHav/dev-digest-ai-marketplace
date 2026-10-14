// AC-5 (curated files): a malformed curated file fails the build with file and rule and writes nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBuild } from '../../helpers/run-build.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FIXTURE = join(REPO, 'test', 'fixtures', 'marketplace');

function rootWithData(mutate) {
  const root = mkdtempSync(join(tmpdir(), 'cur-root-'));
  cpSync(FIXTURE, root, { recursive: true });
  mkdirSync(join(root, 'data'));
  for (const f of readdirSync(join(REPO, 'data'))) cpSync(join(REPO, 'data', f), join(root, 'data', f));
  mutate(join(root, 'data'));
  return root;
}

for (const [label, file, text, rule] of [
  ['a dictionary line without "="', 'dictionary.ua-en.txt', 'привіт\n', /line 1: expected "word = en1, en2"/],
  ['an empty dictionary value', 'dictionary.ua-en.txt', 'привіт =\n', /empty/],
]) {
  test(`a bad curated file (${label}) fails the build, names file and rule, writes nothing`, () => {
    const root = rootWithData((d) => writeFileSync(join(d, file), text));
    const out = mkdtempSync(join(tmpdir(), 'cur-out-'));
    try {
      const r = runBuild({ root, out });
      assert.notEqual(r.code, 0);
      assert.match(r.stderr, new RegExp(`^build-index: data/${file.replace('.', '\\.')}: `, 'm'));
      assert.match(r.stderr, rule);
      assert.deepEqual(readdirSync(out), []);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(out, { recursive: true, force: true });
    }
  });
}

test('a bad stop-word or type-word file fails the build too', () => {
  for (const file of ['stopwords.uk.txt', 'stopwords.en.txt', 'typewords.txt']) {
    const root = rootWithData((d) => writeFileSync(join(d, file), '!!! not a word list\n'));
    const out = mkdtempSync(join(tmpdir(), 'cur-out-'));
    try {
      const r = runBuild({ root, out });
      assert.notEqual(r.code, 0, file);
      assert.match(r.stderr, new RegExp(`build-index: data/${file.replace('.', '\\.')}: `));
      assert.deepEqual(readdirSync(out), []);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(out, { recursive: true, force: true });
    }
  }
});

test('the curated files of the root are what gets bundled', () => {
  const root = rootWithData((d) => writeFileSync(join(d, 'stopwords.en.txt'), 'zzqqmarker\n'));
  const out = mkdtempSync(join(tmpdir(), 'cur-out-'));
  try {
    const r = runBuild({ root, out });
    assert.equal(r.code, 0, r.stderr);
    const js = readdirSync(join(out, 'assets')).filter((n) => n.endsWith('.js')).map((n) => readFileSync(join(out, 'assets', n), 'utf8')).join('\n');
    assert.ok(js.includes('zzqqmarker'));
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  }
});

test('a root without data/ falls back to the repo curated files and the build passes', () => {
  const out = mkdtempSync(join(tmpdir(), 'cur-out-'));
  try {
    assert.equal(existsSync(join(FIXTURE, 'data')), false);
    const r = runBuild({ root: FIXTURE, out });
    assert.equal(r.code, 0, r.stderr);
    assert.ok(existsSync(join(out, 'assets')));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
