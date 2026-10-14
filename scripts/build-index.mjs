#!/usr/bin/env node
// Builds <out>/index.json (the catalog index) and <out>/index.html (the no-JS static list).
// Usage: node scripts/build-index.mjs [--root <dir>] [--out <dir>]
// Defaults: --root is the repository root, --out is <root>/site. INDEX_BUDGET_GZIP_BYTES overrides the size budget.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BuildError } from './lib/errors.mjs';
import { ADD_COMMAND, buildIndex } from './lib/index-builder.mjs';
import { MARKETPLACE } from '../site-src/contract/index-contract.js';

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

function budgetFromEnv() {
  const raw = process.env.INDEX_BUDGET_GZIP_BYTES;
  if (raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) fail('INDEX_BUDGET_GZIP_BYTES must be a positive integer');
  return n;
}

// Legacy static page, adapted to the new index shape. Step 26 replaces it with the real renderer.
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function renderLegacyPage(index, description) {
  const cards = index.plugins
    .map(
      (p) => `    <li class="card">
      <h2>${esc(p.name)} <span class="ver">v${esc(p.version)}</span></h2>
      <p>${esc(p.description)}</p>
      <p class="meta">${p.category ? `Category: ${esc(p.category)}. ` : ''}${
        p.dependencies.length
          ? `Depends on: ${p.dependencies.map((d) => `${esc(d.name)} (${esc(d.range)})`).join(', ')}.`
          : 'No dependencies.'
      }</p>
      <pre><code>${esc(p.install_commands.join('\n'))}</code></pre>
    </li>`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(MARKETPLACE)}</title>
  <style>
    :root { color-scheme: light dark; --bg: #fff; --fg: #1a1a1a; --muted: #555; --line: #d0d0d0; --code: #f3f3f3; --accent: #0b5cad; }
    @media (prefers-color-scheme: dark) { :root { --bg: #121212; --fg: #ececec; --muted: #a8a8a8; --line: #3a3a3a; --code: #1e1e1e; --accent: #7db7f5; } }
    body { margin: 0 auto; max-width: 48rem; padding: 1rem; background: var(--bg); color: var(--fg); font: 16px/1.5 system-ui, sans-serif; }
    a { color: var(--accent); }
    ul { list-style: none; padding: 0; display: grid; gap: 1rem; }
    .card { border: 1px solid var(--line); border-radius: 8px; padding: 0 1rem 1rem; }
    h2 { font-size: 1.15rem; }
    .ver, .meta { color: var(--muted); font-size: .9rem; font-weight: normal; }
    pre { margin: .5rem 0 0; padding: .6rem .8rem; background: var(--code); border-radius: 6px; overflow-x: auto; }
  </style>
</head>
<body>
  <main>
    <h1>${esc(MARKETPLACE)}</h1>
    <p>${esc(description)}</p>
    <h2>Add the marketplace</h2>
    <pre><code>${esc(ADD_COMMAND)}</code></pre>
    <h2>Plugins</h2>
    <ul>
${cards}
    </ul>
  </main>
</body>
</html>
`;
}

const { root, out } = parseArgs(process.argv.slice(2));
let result;
try {
  result = buildIndex({ root, indexBudgetGzipBytes: budgetFromEnv() });
} catch (e) {
  if (e instanceof BuildError) fail(e.message);
  throw e;
}

// All-or-nothing: everything above is computed first, files are written only now.
const catalogDescription = JSON.parse(readFileSync(join(root, '.claude-plugin', 'marketplace.json'), 'utf8')).description;
const html = renderLegacyPage(result.index, typeof catalogDescription === 'string' ? catalogDescription : '');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'index.json'), result.json);
writeFileSync(join(out, 'index.html'), html);
console.log(`build-index: wrote index.json and index.html (${result.index.plugins.length} plugins, ${result.index.artifacts.length} artifacts)`);
