// The index carries each plugin's compatibility range and changelog (fields `compatibility`, `changelog`).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeMarketplace } from '../../helpers/make-marketplace.mjs';
import { buildIndex } from '../../../scripts/lib/index-builder.mjs';

const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures', 'marketplace');
const plugins = (index) => Object.fromEntries(index.plugins.map((p) => [p.name, p]));

test('fixture plugins carry compatibility and a newest-first changelog', () => {
  const p = plugins(buildIndex({ root: FIXTURE }).index);
  assert.deepEqual(p.alpha.compatibility, { claudeCode: '>=2.1.0' });
  assert.deepEqual(p.beta.compatibility, { claudeCode: '>=2.1.100' });
  assert.deepEqual(p.alpha.changelog, [
    { version: '1.0.0', date: '2026-10-01', notes: 'Added the lookup skill and the scout agent.\nTwo hooks and two MCP servers, see the README.' },
    { version: '0.9.0', date: '2026-09-15', notes: 'Preview release.' },
    { version: '0.8.0', date: '2026-09-01', notes: 'First cut.' },
  ]);
  assert.deepEqual(p.beta.changelog, [{ version: '1.0.0', date: null, notes: 'Depends on alpha and gamma.' }]);
  assert.equal(p.gamma.changelog[0].version, p.gamma.version);
});

test('missing CHANGELOG.md and COMPATIBILITY.md do not crash the build', () => {
  const dir = mkdtempSync(join(tmpdir(), 'docs-'));
  try {
    makeMarketplace(dir, { plugins: [{ name: 'bare', files: { 'CHANGELOG.md': null, 'COMPATIBILITY.md': null } }] });
    // makeMarketplace skips a null default, so the files really are absent.
    const [bare] = buildIndex({ root: dir }).index.plugins;
    assert.equal(bare.compatibility, null);
    assert.deepEqual(bare.changelog, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('COMPATIBILITY.md without a range gives null, an unparseable CHANGELOG gives []', () => {
  const dir = mkdtempSync(join(tmpdir(), 'docs-'));
  try {
    makeMarketplace(dir, { plugins: [{ name: 'odd', files: { 'COMPATIBILITY.md': 'Works everywhere.\n', 'CHANGELOG.md': 'free text\n' } }] });
    const [odd] = buildIndex({ root: dir }).index.plugins;
    assert.equal(odd.compatibility, null);
    assert.deepEqual(odd.changelog, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('every changelog entry is { version, date, notes } and notes stay within the cap', () => {
  const p = plugins(buildIndex({ root: FIXTURE }).index);
  for (const pl of Object.values(p)) {
    for (const e of pl.changelog) {
      assert.deepEqual(Object.keys(e), ['version', 'date', 'notes']);
      assert.ok(e.date === null || /^\d{4}-\d{2}-\d{2}$/.test(e.date));
      assert.ok(e.notes.length <= 600);
    }
  }
});
