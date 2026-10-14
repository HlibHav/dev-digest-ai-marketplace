#!/usr/bin/env node
// Builds site/index.json and site/index.html from the catalog and each plugin.json.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MARKETPLACE = 'dev-digest-ai-marketplace';
const ADD_CMD = `/plugin marketplace add HlibHav/${MARKETPLACE}`;

function readJson(rel) {
  try {
    return JSON.parse(readFileSync(join(root, rel), 'utf8'));
  } catch (e) {
    console.error(`build-index: ${rel}: ${e.message}`);
    process.exit(1);
  }
}
const bad = (msg) => {
  console.error(`build-index: ${msg}`);
  process.exit(1);
};

const catalog = readJson('.claude-plugin/marketplace.json');
if (!Array.isArray(catalog.plugins)) bad('.claude-plugin/marketplace.json: "plugins" must be an array');

const plugins = catalog.plugins.map((entry) => {
  if (typeof entry?.name !== 'string' || typeof entry.source !== 'string') bad('catalog entry needs string name and source');
  const manifest = readJson(`${entry.source.replace(/^\.\//, '')}/.claude-plugin/plugin.json`);
  if (typeof manifest.version !== 'string') bad(`${entry.name}: plugin.json has no version`);
  const deps = (manifest.dependencies ?? []).map((d) => (typeof d === 'string' ? d : d?.name));
  if (deps.some((d) => typeof d !== 'string')) bad(`${entry.name}: malformed dependencies`);
  return {
    name: entry.name,
    version: manifest.version,
    description: manifest.description ?? entry.description ?? '',
    category: entry.category ?? '',
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    dependencies: deps,
    install: `/plugin install ${entry.name}@${MARKETPLACE}`,
  };
});

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const cards = plugins
  .map(
    (p) => `    <li class="card">
      <h2>${esc(p.name)} <span class="ver">v${esc(p.version)}</span></h2>
      <p>${esc(p.description)}</p>
      <p class="meta">${p.category ? `Category: ${esc(p.category)}. ` : ''}${
        p.dependencies.length ? `Depends on: ${p.dependencies.map(esc).join(', ')}.` : 'No dependencies.'
      }</p>
      <pre><code>${esc(p.install)}</code></pre>
    </li>`,
  )
  .join('\n');

const html = `<!doctype html>
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
    <p>${esc(catalog.description ?? '')}</p>
    <h2>Add the marketplace</h2>
    <pre><code>${esc(ADD_CMD)}</code></pre>
    <h2>Plugins</h2>
    <ul>
${cards}
    </ul>
  </main>
</body>
</html>
`;

mkdirSync(join(root, 'site'), { recursive: true });
writeFileSync(join(root, 'site/index.json'), JSON.stringify(plugins, null, 2) + '\n');
writeFileSync(join(root, 'site/index.html'), html);
console.log(`build-index: wrote site/index.json and site/index.html (${plugins.length} plugins)`);
