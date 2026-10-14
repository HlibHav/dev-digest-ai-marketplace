// NFR security: the page carries a strict same-origin CSP; the shipped site needs nothing looser.
import test from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CSP } from '../../../scripts/lib/csp.mjs';
import { runBuild } from '../../helpers/run-build.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FIXTURE = join(REPO, 'test', 'fixtures', 'marketplace');

test('the CSP is the strict same-origin policy', () => {
  assert.equal(
    CSP,
    "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'",
  );
  assert.ok(!/unsafe-|\*|https?:/.test(CSP));
});

test('the built page carries the CSP meta, hashed relative assets and a versioned index URL; no inline code', () => {
  const out = mkdtempSync(join(tmpdir(), 'csp-'));
  try {
    const r = runBuild({ root: FIXTURE, out });
    assert.equal(r.code, 0, r.stderr);
    const html = readFileSync(join(out, 'index.html'), 'utf8');
    assert.ok(html.includes(`content="${CSP.replaceAll("'", '&#39;')}"`));
    assert.match(html, /<link rel="stylesheet" href="assets\/app-[A-Za-z0-9]+\.css">/);
    assert.match(html, /<script type="module" src="assets\/app-[A-Za-z0-9]+\.js"><\/script>/);
    assert.match(html, /data-index-url="index\.json\?v=[0-9a-f]{8}"/);
    assert.ok(!/<script(?![^>]*\bsrc=)/.test(html), 'no inline script');
    assert.ok(!/<style|\sstyle=/.test(html), 'no inline style');
    assert.ok(!/(href|src)="\//.test(html) && !/(href|src)="https?:/.test(html), 'asset URLs are relative');
    const v = html.match(/index\.json\?v=([0-9a-f]{8})/)[1];
    assert.equal(createHash('sha256').update(readFileSync(join(out, 'index.json'))).digest('hex').slice(0, 8), v);
    assert.deepEqual(readdirSync(out).sort(), ['assets', 'index.html', 'index.json', 'licenses.txt']);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
