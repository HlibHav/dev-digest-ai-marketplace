import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBuild } from '../../helpers/run-build.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FIXTURE = join(REPO, 'test', 'fixtures', 'marketplace');
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

function twice(root, files) {
  const a = mkdtempSync(join(tmpdir(), 'det-a-'));
  const b = mkdtempSync(join(tmpdir(), 'det-b-'));
  try {
    assert.equal(runBuild({ root, out: a }).code, 0);
    assert.equal(runBuild({ root, out: b }).code, 0);
    for (const f of files) assert.equal(sha(join(a, f)), sha(join(b, f)), `${f} differs between builds`);
  } finally {
    rmSync(a, { recursive: true, force: true });
    rmSync(b, { recursive: true, force: true });
  }
}

test('AC-10: two builds of the fixture give byte-identical index.json and index.html', () => {
  twice(FIXTURE, ['index.json', 'index.html']);
});

test('AC-10: two builds of the real catalog give byte-identical index.json and index.html', () => {
  twice(REPO, ['index.json', 'index.html']);
});

test('index.json is compact with exactly one trailing newline and no timestamps or absolute paths', () => {
  const out = mkdtempSync(join(tmpdir(), 'det-c-'));
  try {
    assert.equal(runBuild({ root: FIXTURE, out }).code, 0);
    const raw = readFileSync(join(out, 'index.json'), 'utf8');
    assert.ok(raw.endsWith('}\n') && !raw.endsWith('\n\n'));
    assert.equal(raw, `${JSON.stringify(JSON.parse(raw))}\n`);
    assert.ok(!/\d{4}-\d{2}-\d{2}T\d{2}:/.test(raw), 'no timestamp');
    assert.ok(!raw.includes(out), 'no output path');
    assert.ok(!raw.includes(FIXTURE), 'no absolute root path');
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
