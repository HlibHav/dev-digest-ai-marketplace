// AC-57: the built effects bundle makes no network call, runs no dynamic code and carries no URL.
// The fake renderer never reaches a default build. No test library reaches the site.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleSite } from '../../../scripts/lib/bundle.mjs';
import { scanEffects, checkEffectsChunks } from '../../../scripts/lib/effects-scan.mjs';
import { runBuild } from '../../helpers/run-build.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FIXTURE = join(REPO, 'test', 'fixtures', 'marketplace');

const BAD = {
  fetch: 'const r = fetch("x");',
  XMLHttpRequest: 'new XMLHttpRequest()',
  WebSocket: 'new WebSocket(u)',
  sendBeacon: 'navigator.sendBeacon(u)',
  'eval(': 'eval ("1")',
  'new Function': 'new  Function("return 1")',
  'http://': 'const u = "http://example.test/a";',
  'https://': 'const u = "https://example.test/a";',
};

for (const [label, code] of Object.entries(BAD)) {
  test(`scanEffects flags ${label}`, () => {
    const hits = scanEffects(code);
    assert.ok(hits.includes(label), JSON.stringify(hits));
  });
}

test('scanEffects accepts clean code', () => {
  assert.deepEqual(scanEffects('const gpu = navigator.gpu; requestAnimationFrame(() => gpu);'), []);
});

test('checkEffectsChunks throws a BuildError naming the file and the token', () => {
  assert.throws(
    () => checkEffectsChunks([{ path: 'assets/fx-entry-X.js', text: 'fetch(1)' }]),
    (e) => e.name === 'BuildError' && /assets\/fx-entry-X\.js/.test(e.message) && /fetch/.test(e.message),
  );
  assert.doesNotThrow(() => checkEffectsChunks([{ path: 'a.js', text: 'let a = 1' }]));
});

test('AC-57: the real built effects chunk passes the scan', async () => {
  const site = await bundleSite({ root: FIXTURE, fakeFx: false });
  assert.ok(site.effects.length >= 1);
  const files = site.effects.map((path) => ({ path, text: site.contents.get(path).toString('utf8') }));
  assert.ok(files.every((f) => f.text.length > 500), 'effects chunk has real content');
  assert.deepEqual(files.flatMap((f) => scanEffects(f.text)), []);
});

test('the default build never contains the fake renderer; SITE_FAKE_FX=1 does', async () => {
  const real = await bundleSite({ root: FIXTURE, fakeFx: false });
  const fake = await bundleSite({ root: FIXTURE, fakeFx: true });
  const all = (site) => [...site.contents.entries()].filter(([p]) => p.endsWith('.js')).map(([, b]) => b.toString('utf8')).join('\n');
  assert.ok(!all(real).includes('__fxLog'), 'default build has no fake renderer');
  assert.ok(!Object.keys(real.metafile.inputs).some((p) => p.endsWith('fake-renderer.js')));
  assert.ok(all(fake).includes('__fxLog'), 'fake build has the fake renderer');
  assert.ok(!Object.keys(fake.metafile.inputs).some((p) => p.endsWith('effects/webgpu-renderer.js')));
});

test('the environment variable alone does not put the fake into a default bundleSite call', async () => {
  const before = process.env.SITE_FAKE_FX;
  delete process.env.SITE_FAKE_FX;
  try {
    const site = await bundleSite({ root: FIXTURE });
    assert.ok(!Object.keys(site.metafile.inputs).some((p) => p.endsWith('fake-renderer.js')));
  } finally {
    if (before !== undefined) process.env.SITE_FAKE_FX = before;
  }
});

test('no test library and no third-party package except minisearch reaches the site', async () => {
  const site = await bundleSite({ root: FIXTURE, fakeFx: false });
  const inputs = Object.keys(site.metafile.inputs);
  assert.ok(!inputs.some((p) => /playwright|axe-core/.test(p)));
  const pkgs = new Set(inputs.filter((p) => p.startsWith('node_modules/')).map((p) => p.split('/')[1]));
  assert.deepEqual([...pkgs], ['minisearch']);
  assert.ok(!inputs.some((p) => /(^|\/)test\//.test(p)));
});

test('licenses.txt credits minisearch and ships with the build', () => {
  const out = mkdtempSync(join(tmpdir(), 'lic-'));
  try {
    const r = runBuild({ root: FIXTURE, out });
    assert.equal(r.code, 0, r.stderr);
    assert.ok(readdirSync(out).includes('licenses.txt'));
    assert.match(readFileSync(join(out, 'licenses.txt'), 'utf8'), /minisearch/i);
    assert.match(readFileSync(join(out, 'licenses.txt'), 'utf8'), /MIT License|Permission is hereby granted/);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
