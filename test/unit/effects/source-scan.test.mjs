// AC-57, source level: the effects code is the project's own and makes no network call, no dynamic
// code and carries no URL. Lane 6 repeats the scan on the built effects bundle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('../../../site-src/effects', import.meta.url));
const FORBIDDEN = [
  ['fetch', /\bfetch\b/],
  ['XMLHttpRequest', /XMLHttpRequest/],
  ['WebSocket', /WebSocket/],
  ['sendBeacon', /sendBeacon/],
  ['eval(', /\beval\s*\(/],
  ['new Function', /new\s+Function\b/],
  ['http://', /http:\/\//],
  ['https://', /https:\/\//],
  ['Worker', /\bnew\s+(Shared)?Worker\b/],
  ['import()', /\bimport\s*\(/],
  ['blob:', /blob:/],
];

test('AC-57: site-src/effects has sources and no network call, dynamic code or URL', () => {
  const files = readdirSync(DIR).filter((n) => n.endsWith('.js'));
  assert.ok(files.includes('webgpu-renderer.js') && files.includes('controller.js') && files.includes('fx-entry.js'));
  const hits = [];
  for (const f of files) {
    const text = readFileSync(join(DIR, f), 'utf8');
    for (const [label, re] of FORBIDDEN) if (re.test(text)) hits.push(`${f}: ${label}`);
  }
  assert.deepEqual(hits, []);
});

test('AC-57: no third-party import in the effects sources', () => {
  for (const f of readdirSync(DIR).filter((n) => n.endsWith('.js'))) {
    const text = readFileSync(join(DIR, f), 'utf8');
    for (const m of text.matchAll(/^import\s[^'"]*['"]([^'"]+)['"]/gm)) assert.match(m[1], /^\.{1,2}\//, `${f} imports ${m[1]}`);
  }
});
