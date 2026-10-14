// AC-10 (site): the whole site/ tree is byte-identical across two builds, and a rebuild into the same dir leaves no stale files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBuild } from '../../helpers/run-build.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FIXTURE = join(REPO, 'test', 'fixtures', 'marketplace');

function snapshot(dir) {
  const out = {};
  const walk = (d) => {
    for (const n of readdirSync(d).sort()) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else out[p.slice(dir.length + 1)] = readFileSync(p).toString('base64');
    }
  };
  walk(dir);
  return out;
}

for (const [label, root] of [['fixture', FIXTURE], ['real catalog', REPO]]) {
  test(`AC-10: the whole site tree of the ${label} is byte-identical across two builds`, () => {
    const a = mkdtempSync(join(tmpdir(), 'det-a-'));
    const b = mkdtempSync(join(tmpdir(), 'det-b-'));
    try {
      assert.equal(runBuild({ root, out: a }).code, 0);
      assert.equal(runBuild({ root, out: b }).code, 0);
      const sa = snapshot(a);
      const sb = snapshot(b);
      assert.deepEqual(Object.keys(sa), Object.keys(sb));
      assert.ok(Object.keys(sa).length >= 5, Object.keys(sa).join());
      for (const k of Object.keys(sa)) assert.equal(sa[k], sb[k], `${k} differs`);
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
  });
}

test('rebuilding into a used directory removes stale assets', () => {
  const out = mkdtempSync(join(tmpdir(), 'det-c-'));
  try {
    mkdirSync(join(out, 'assets'));
    writeFileSync(join(out, 'assets', 'stale-12345678.js'), 'old');
    assert.equal(runBuild({ root: FIXTURE, out }).code, 0);
    assert.ok(!readdirSync(join(out, 'assets')).includes('stale-12345678.js'));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('a failing build leaves an existing output untouched', () => {
  const out = mkdtempSync(join(tmpdir(), 'det-d-'));
  try {
    assert.equal(runBuild({ root: FIXTURE, out }).code, 0);
    const before = snapshot(out);
    const r = runBuild({ root: FIXTURE, out, env: { JS_BUDGET_GZIP_BYTES: '2000' } });
    assert.notEqual(r.code, 0);
    assert.deepEqual(snapshot(out), before);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
