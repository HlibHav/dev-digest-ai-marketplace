#!/usr/bin/env node
// Builds the whole site into <out>: index.json (the catalog index), index.html (the static list, readable
// without JavaScript), assets/ (hashed JS and CSS) and licenses.txt.
// Usage: node scripts/build-index.mjs [--root <dir>] [--out <dir>]
// Defaults: --root is the repository root, --out is <root>/site.
// Env: INDEX_BUDGET_GZIP_BYTES and JS_BUDGET_GZIP_BYTES override the size budgets; SITE_FAKE_FX=1 (tests only)
// swaps the WebGPU renderer for a test double.
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BuildError } from './lib/errors.mjs';
import { buildIndex } from './lib/index-builder.mjs';
import { bundleSite, loadCurated } from './lib/bundle.mjs';
import { checkJsBudget } from './lib/budget-js.mjs';
import { checkEffectsChunks } from './lib/effects-scan.mjs';
import { CSP } from './lib/csp.mjs';
import { gzipBytes } from './lib/budget.mjs';
import { renderPage } from './lib/render/page.mjs';
import { resolveInside } from './lib/safe-path.mjs';

const USAGE = 'usage: node scripts/build-index.mjs [--root <dir>] [--out <dir>]';
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function fail(message, code = 1) {
  console.error(`build-index: ${message}`);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = { root: repoRoot, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--root' || a === '--out') {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) fail(`${a} needs a directory\n${USAGE}`, 2);
      opts[a.slice(2)] = resolve(v);
      i += 1;
    } else {
      fail(`unknown argument "${a}"\n${USAGE}`, 2);
    }
  }
  opts.out ??= join(opts.root, 'site');
  return opts;
}

function budgetFromEnv(name) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) fail(`${name} must be a positive integer`);
  return n;
}

const { root, out } = parseArgs(process.argv.slice(2));
const jsBudget = budgetFromEnv('JS_BUDGET_GZIP_BYTES');

// Everything is computed first; files are written only when all of it has succeeded.
let files;
let summary;
try {
  loadCurated(root);
  const { index, json } = buildIndex({ root, indexBudgetGzipBytes: budgetFromEnv('INDEX_BUDGET_GZIP_BYTES') });
  const site = await bundleSite({ root });
  const core = checkJsBudget(site.metafile, site.contents, jsBudget === undefined ? {} : { failBytes: jsBudget });
  const effectChunks = site.effects.map((path) => ({ path, text: site.contents.get(path).toString('utf8') }));
  checkEffectsChunks(effectChunks);
  const version = createHash('sha256').update(json).digest('hex').slice(0, 8);
  const html = renderPage({ index, assets: { css: site.css, js: site.js, indexUrl: `index.json?v=${version}` }, csp: CSP });
  files = new Map([...site.contents, ['index.json', Buffer.from(json)], ['index.html', Buffer.from(html)]]);
  if (core.warning) console.error(`build-index: warning: ${core.warning}`);
  const effectsBytes = effectChunks.reduce((n, f) => n + gzipBytes(f.text), 0);
  summary = `build-index: wrote ${files.size} files (${index.plugins.length} plugins, ${index.artifacts.length} artifacts); core JS ${core.bytes} bytes gzipped, effects JS ${effectsBytes} bytes gzipped`;
} catch (e) {
  if (e instanceof BuildError) fail(e.message);
  throw e;
}

rmSync(join(out, 'assets'), { recursive: true, force: true });
for (const [path, bytes] of [...files].sort(([a], [b]) => (a < b ? -1 : 1))) {
  const target = resolveInside(out, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
}
console.log(summary);
