// Layering: site-src is browser code and imports no node:* module; search and contract stay isomorphic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SRC = join(root, 'site-src');

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** Every module specifier a file imports, exports from, or dynamically imports. */
export function specifiers(text) {
  const out = [];
  const stripped = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const m of stripped.matchAll(/\b(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g)) out.push(m[1]);
  for (const m of stripped.matchAll(/\bimport\s*['"]([^'"]+)['"]/g)) out.push(m[1]);
  for (const m of stripped.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1]);
  for (const m of stripped.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1]);
  return out;
}

const files = walk(SRC).filter((p) => p.endsWith('.js'));

test('specifiers() reads static, re-export, side-effect and dynamic imports', () => {
  const text = `import a from './a.js';\nexport { b } from "../b.js";\nimport './c.js';\nconst d = await import('./d.js');\n// import x from 'node:fs'\n`;
  assert.deepEqual(specifiers(text).sort(), ['../b.js', './a.js', './c.js', './d.js']);
});

test('site-src has JavaScript files to check', () => {
  assert.ok(files.length > 15);
});

test('site-src imports no node:* module and no Node built-in', () => {
  const builtins = new Set(['fs', 'path', 'os', 'child_process', 'crypto', 'http', 'https', 'net', 'url', 'zlib', 'stream', 'util']);
  const bad = [];
  for (const f of files) {
    for (const s of specifiers(readFileSync(f, 'utf8'))) {
      if (s.startsWith('node:') || builtins.has(s)) bad.push(`${relative(root, f)} imports ${s}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('site-src imports nothing from scripts/, test/ or the repo outside site-src and data/', () => {
  const bad = [];
  for (const f of files) {
    for (const s of specifiers(readFileSync(f, 'utf8'))) {
      if (!s.startsWith('.')) continue;
      const target = resolve(dirname(f), s);
      const inSrc = target === SRC || target.startsWith(SRC + sep);
      const inData = target.startsWith(join(root, 'data') + sep);
      if (!inSrc && !inData) bad.push(`${relative(root, f)} imports ${s}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('site-src/contract imports nothing outside itself', () => {
  const bad = [];
  for (const f of files.filter((p) => p.startsWith(join(SRC, 'contract') + sep))) {
    for (const s of specifiers(readFileSync(f, 'utf8'))) {
      const target = s.startsWith('.') ? resolve(dirname(f), s) : null;
      if (!target || !target.startsWith(join(SRC, 'contract') + sep)) bad.push(`${relative(root, f)} imports ${s}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('site-src/search imports only itself, the contract and minisearch', () => {
  const bad = [];
  for (const f of files.filter((p) => p.startsWith(join(SRC, 'search') + sep))) {
    for (const s of specifiers(readFileSync(f, 'utf8'))) {
      if (s === 'minisearch') continue;
      const target = s.startsWith('.') ? resolve(dirname(f), s) : null;
      const ok = target && (target.startsWith(join(SRC, 'search') + sep) || target.startsWith(join(SRC, 'contract') + sep));
      if (!ok) bad.push(`${relative(root, f)} imports ${s}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('site-src/effects imports only itself, the contract and the pure colour table', () => {
  const bad = [];
  for (const f of files.filter((p) => p.startsWith(join(SRC, 'effects') + sep))) {
    for (const s of specifiers(readFileSync(f, 'utf8'))) {
      const target = s.startsWith('.') ? resolve(dirname(f), s) : null;
      if (!target || !(target.startsWith(join(SRC, 'effects') + sep) || target.startsWith(join(SRC, 'contract') + sep) || target === join(SRC, 'app', 'type-colors.js'))) bad.push(`${relative(root, f)} imports ${s}`);
    }
  }
  assert.deepEqual(bad, []);
});
