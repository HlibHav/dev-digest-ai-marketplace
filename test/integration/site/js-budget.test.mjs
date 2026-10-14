// AC-55: the JavaScript needed for search, builder and the static look stays at or under 60 KB gzipped.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBuild } from '../../helpers/run-build.mjs';
import { bundleSite } from '../../../scripts/lib/bundle.mjs';
import {
  CORE_JS_FAIL_BYTES, CORE_JS_WARN_BYTES, coreOutputs, coreJsGzipBytes, checkJsBudget,
} from '../../../scripts/lib/budget-js.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FIXTURE = join(REPO, 'test', 'fixtures', 'marketplace');

const meta = {
  outputs: {
    'assets/app-AAA.js': {
      bytes: 10,
      entryPoint: 'site-src/entry.js',
      imports: [
        { path: 'assets/chunk-BBB.js', kind: 'import-statement' },
        { path: 'assets/fx-entry-CCC.js', kind: 'dynamic-import' },
      ],
      inputs: { 'site-src/big.js': { bytesInOutput: 900 }, 'site-src/small.js': { bytesInOutput: 50 } },
    },
    'assets/chunk-BBB.js': { bytes: 5, imports: [], inputs: { 'node_modules/minisearch/x.js': { bytesInOutput: 400 } } },
    'assets/fx-entry-CCC.js': { bytes: 5, entryPoint: 'site-src/effects/fx-entry.js', imports: [], inputs: {} },
  },
};

test('the thresholds are 60 KB (fail) and 45 KB (warn)', () => {
  assert.equal(CORE_JS_FAIL_BYTES, 61440);
  assert.equal(CORE_JS_WARN_BYTES, 46080);
});

test('coreOutputs follows static imports only, never dynamic ones', () => {
  assert.deepEqual(coreOutputs(meta).sort(), ['assets/app-AAA.js', 'assets/chunk-BBB.js']);
});

test('coreJsGzipBytes sums the gzip of every core output and ignores the lazy chunk', () => {
  const contents = new Map([
    ['assets/app-AAA.js', Buffer.from('a'.repeat(5000))],
    ['assets/chunk-BBB.js', Buffer.from('b'.repeat(3000))],
    ['assets/fx-entry-CCC.js', Buffer.from('c'.repeat(90000))],
  ]);
  const expected = gzipSync(contents.get('assets/app-AAA.js')).length + gzipSync(contents.get('assets/chunk-BBB.js')).length;
  assert.equal(coreJsGzipBytes(meta, contents), expected);
});

test('checkJsBudget fails over the limit and names the biggest inputs', () => {
  const contents = new Map([
    ['assets/app-AAA.js', Buffer.from('a'.repeat(5000))],
    ['assets/chunk-BBB.js', Buffer.from('b'.repeat(3000))],
  ]);
  assert.throws(
    () => checkJsBudget(meta, contents, { failBytes: 10, warnBytes: 5 }),
    (e) => e.name === 'BuildError' && /over the budget of 10 bytes/.test(e.message) && /site-src\/big\.js/.test(e.message)
      && e.message.indexOf('site-src/big.js') < e.message.indexOf('site-src/small.js'),
  );
});

test('checkJsBudget warns above 45 KB but passes under 60 KB', () => {
  // Incompressible bytes so that gzip is about as large as the input.
  const noise = Buffer.concat(Array.from({ length: 1700 }, (_, i) => createHash('sha256').update(String(i)).digest()));
  const contents = new Map([['assets/app-AAA.js', noise], ['assets/chunk-BBB.js', Buffer.alloc(0)]]);
  const r = checkJsBudget(meta, contents, {});
  assert.ok(r.bytes > CORE_JS_WARN_BYTES && r.bytes <= CORE_JS_FAIL_BYTES, `size ${r.bytes}`);
  assert.equal(r.warning !== null, true);
  const small = checkJsBudget(meta, new Map([['assets/app-AAA.js', Buffer.from('x')], ['assets/chunk-BBB.js', Buffer.alloc(0)]]), {});
  assert.equal(small.warning, null);
});

test('AC-55: a real fixture build has a core under 61 440 bytes gzipped and a separate effects chunk', async () => {
  const site = await bundleSite({ root: FIXTURE, fakeFx: false });
  const bytes = coreJsGzipBytes(site.metafile, site.contents);
  assert.ok(bytes > 1000, `suspiciously small: ${bytes}`);
  assert.ok(bytes < 61440, `core JS is ${bytes} bytes gzipped`);
  assert.equal(site.js.length, 1);
  assert.match(site.js[0], /^assets\/app-[A-Za-z0-9]+\.js$/);
  assert.ok(site.effects.length >= 1);
  for (const f of site.effects) assert.match(f, /^assets\/fx-entry-[A-Za-z0-9]+\.js$|^assets\/[A-Za-z0-9_-]+-[A-Za-z0-9]+\.js$/);
  assert.ok(site.effects.some((f) => /fx-entry-/.test(f)), 'fx-entry is its own content-hashed chunk');
  assert.ok(!coreOutputs(site.metafile).some((f) => /fx-entry/.test(f)), 'effects are not part of the core');
});

test('a lowered budget fails the build, names the biggest inputs and writes nothing', () => {
  const out = mkdtempSync(join(tmpdir(), 'jsb-'));
  try {
    const r = runBuild({ root: FIXTURE, out, env: { JS_BUDGET_GZIP_BYTES: '2000' } });
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /^build-index: .*over the budget of 2000 bytes/m);
    assert.match(r.stderr, /site-src\//);
    assert.deepEqual(readdirSync(out), []);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('the build reports the core and effects sizes', () => {
  const out = mkdtempSync(join(tmpdir(), 'jsb-'));
  try {
    const r = runBuild({ root: FIXTURE, out });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /core JS \d+ bytes gzipped/);
    assert.match(r.stdout, /effects JS \d+ bytes gzipped/);
    const css = readdirSync(join(out, 'assets')).filter((n) => n.endsWith('.css'));
    assert.equal(css.length, 1);
    assert.ok(readFileSync(join(out, 'assets', css[0]), 'utf8').includes('[hidden]'));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
