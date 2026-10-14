import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const manifest = (name) => JSON.parse(readFileSync(join(root, 'node_modules', name, 'package.json'), 'utf8'));
const repoUrl = (m) => (typeof m.repository === 'string' ? m.repository : (m.repository?.url ?? ''));

test('shaders is the MIT package from shader-effects-inc/shaders', () => {
  const m = manifest('shaders');
  assert.equal(m.license, 'MIT');
  assert.match(repoUrl(m), /shader-effects-inc\/shaders/);
});

test('minisearch is MIT', () => {
  assert.equal(manifest('minisearch').license, 'MIT');
});
