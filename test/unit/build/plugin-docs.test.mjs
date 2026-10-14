import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_NOTES_CHARS, firstChangelogVersion, parseChangelog, parseCompatibility } from '../../../scripts/lib/plugin-docs.mjs';

test('changelog headings: bare, em dash, hyphen and parenthesised dates', () => {
  const entries = parseChangelog([
    '# Changelog', '',
    '## 1.2.0 — 2026-10-14', '- a',
    '## 1.1.0 - 2026-10-01', '- b',
    '## 1.0.0 (2026-09-01)', '- c',
    '## 0.9.0', '- d',
  ].join('\n'));
  assert.deepEqual(entries.map((e) => [e.version, e.date, e.notes]), [
    ['1.2.0', '2026-10-14', 'a'],
    ['1.1.0', '2026-10-01', 'b'],
    ['1.0.0', '2026-09-01', 'c'],
    ['0.9.0', null, 'd'],
  ]);
});

test('notes are the bullets, with markdown markers and backticks stripped', () => {
  const [e] = parseChangelog([
    '## 2.0.0 — 2026-10-14',
    '',
    '### Added',
    '- **Breaking:** `agent-guard` now reads [the docs](https://x.test/y)',
    '* second *emphasised* line',
    '1. numbered `one`',
    'Prose that is not a bullet is ignored.',
  ].join('\n'));
  assert.equal(e.notes, 'Breaking: agent-guard now reads the docs\nsecond emphasised line\nnumbered one');
  assert.ok(!/[`*\[\]]/.test(e.notes));
});

test('an unreleased or unrelated section ends the previous entry and is not an entry itself', () => {
  const entries = parseChangelog('## 1.0.0\n- a\n## Unreleased\n- not mine\n## 0.9.0\n- b');
  assert.deepEqual(entries.map((e) => [e.version, e.notes]), [['1.0.0', 'a'], ['0.9.0', 'b']]);
});

test('notes are capped, whole lines first', () => {
  const lines = Array.from({ length: 40 }, (_, i) => `- line number ${i} with some padding text`);
  const [e] = parseChangelog(`## 1.0.0\n${lines.join('\n')}`);
  assert.ok(e.notes.length <= MAX_NOTES_CHARS);
  assert.ok(e.notes.split('\n').every((l) => /^line number \d+ with some padding text$/.test(l)), 'no line is cut');
  const [long] = parseChangelog(`## 1.0.0\n- ${'x'.repeat(2000)}`);
  assert.equal(long.notes.length, MAX_NOTES_CHARS);
  assert.ok(long.notes.endsWith('…'));
});

test('no headings, empty text, CRLF', () => {
  assert.deepEqual(parseChangelog(''), []);
  assert.deepEqual(parseChangelog('# Changelog\n\nnothing yet'), []);
  assert.equal(parseChangelog('## 1.0.0\r\n- a\r\n- b\r\n')[0].notes, 'a\nb');
  assert.equal(firstChangelogVersion('# C\n## 3.1.4-beta.1 - 2026-01-01\n- x'), '3.1.4-beta.1');
  assert.equal(firstChangelogVersion('no headings'), null);
});

test('compatibility: first >= range after "Claude Code", with or without backticks and spaces', () => {
  assert.deepEqual(parseCompatibility('Claude Code >=2.1.0'), { claudeCode: '>=2.1.0' });
  assert.deepEqual(parseCompatibility('Requires Claude Code `>= 2.1.296`.'), { claudeCode: '>=2.1.296' });
  assert.deepEqual(parseCompatibility('Claude Code>=2.0.0 and later\nClaude Code >=3.0.0'), { claudeCode: '>=2.0.0' });
  assert.equal(parseCompatibility('Works with recent versions'), null);
  assert.equal(parseCompatibility('Claude Code 2.1'), null);
  assert.equal(parseCompatibility(''), null);
});
