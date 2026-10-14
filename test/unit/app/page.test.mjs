import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPage } from '../../../scripts/lib/render/page.mjs';
import { assertIndexShape } from '../../../site-src/contract/index-contract.js';

const TRUST = { hooks: [], mcp_servers: [], has_scripts: false, network_urls: [] };
const COST = { always_loaded_tokens: 0, on_invocation_tokens: 0, method: 'characters / 4, rounded up', excluded: [] };
const plugin = (over) => ({
  name: 'p', version: '1.0.0', description: 'd', category: 'c', tags: [], dependencies: [],
  install_commands: [
    '/plugin marketplace add HlibHav/dev-digest-ai-marketplace',
    `/plugin install ${over.name}@dev-digest-ai-marketplace`,
  ],
  trust: TRUST, cost: COST, ...over,
});
const INDEX = {
  schema_version: 1,
  marketplace: 'dev-digest-ai-marketplace',
  plugins: [
    plugin({ name: 'alpha', version: '1.2.3', description: 'Alpha does things', category: 'engineering' }),
    plugin({
      name: 'beta', version: '0.4.0', category: 'review',
      description: 'Beta <script>window.__x=1</script> & <img src=x onerror=alert(1)> "quoted" it\'s',
      dependencies: [{ name: 'alpha', range: '^1.0.0' }, { name: 'gamma', range: '>=2.0.0 <3' }],
    }),
    plugin({ name: 'gamma', version: '2.0.0', description: 'Gamma', category: 'misc' }),
  ],
  artifacts: [],
};
const ASSETS = { css: ['assets/app-1a2b3c4d.css'], js: ['assets/app-1a2b3c4d.js'], indexUrl: 'index.json?v=deadbeef' };
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'";
const html = renderPage({ index: INDEX, assets: ASSETS, csp: CSP });

test('fixture index satisfies the contract', () => assertIndexShape(INDEX));

test('AC-25: every plugin appears with name, version, description, category, dependencies and install commands', () => {
  for (const p of INDEX.plugins) {
    assert.ok(html.includes(`>${p.name}</h3>`), `name ${p.name}`);
    assert.ok(html.includes(`v${p.version}`), `version ${p.version}`);
    assert.ok(html.includes(`>${p.category}</span>`), `category ${p.category}`);
    for (const line of p.install_commands) assert.ok(html.includes(line), line);
    for (const d of p.dependencies) {
      assert.ok(html.includes(`<code>${d.name}</code>`), `dep ${d.name}`);
    }
  }
  assert.ok(html.includes('Alpha does things'));
  assert.ok(html.includes('^1.0.0'));
  assert.ok(html.includes('&gt;=2.0.0 &lt;3'), 'ranges are escaped');
  assert.ok(html.includes('No dependencies'));
  assert.equal((html.match(/data-card /g) ?? []).length, 3);
  assert.equal((html.match(/data-type="plugin"/g) ?? []).length, 3);
});

test('AC-24: markup from the index is escaped', () => {
  assert.ok(!html.includes('<script>window'), 'no raw script');
  assert.ok(!html.includes('<img'), 'no raw img');
  assert.ok(html.includes('&lt;script&gt;window.__x=1&lt;/script&gt;'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(html.includes('&quot;quoted&quot;'));
  assert.ok(html.includes('it&#39;s'));
  const hostile = renderPage({
    index: { ...INDEX, plugins: [plugin({ name: '"><script>x</script>', description: 'z' })] },
    assets: ASSETS, csp: CSP,
  });
  assert.ok(!hostile.includes('"><script>x'), 'attribute value is escaped');
  assert.equal((hostile.match(/<script/g) ?? []).length, 1);
});

test('the only script is a module with a relative src', () => {
  const scripts = html.match(/<script\b[^>]*>/g) ?? [];
  assert.deepEqual(scripts, ['<script type="module" src="assets/app-1a2b3c4d.js">']);
  assert.ok(!/<script[^>]*>[^<]+<\/script>/.test(html), 'no inline script body');
});

test('the CSP meta tag is present and carries the given policy', () => {
  const escaped = CSP.replaceAll("'", '&#39;');
  assert.ok(html.includes(`<meta http-equiv="Content-Security-Policy" content="${escaped}">`));
});

test('no style attribute and no inline style element (CSP has no unsafe-inline)', () => {
  assert.ok(!/\sstyle\s*=/i.test(html));
  assert.ok(!/<style\b/i.test(html));
});

test('all URLs are relative and the index URL is passed through', () => {
  assert.ok(!/(?:src|href)="(?:\/|[a-z]+:)/i.test(html));
  assert.ok(html.includes('data-index-url="index.json?v=deadbeef"'));
  assert.ok(html.includes('<link rel="stylesheet" href="assets/app-1a2b3c4d.css">'));
});

test('the DOM contract hooks exist', () => {
  assert.match(html, /<header id="site-header"[^>]* data-fx-header>/);
  assert.match(html, /<form id="search-form"[^>]* hidden>/);
  assert.match(html, /id="status"/);
  assert.match(html, /<p id="result-count"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /<p id="copy-status"[^>]*role="status"/);
  assert.match(html, /<ul id="static-list"[^>]* data-fx-cards>/);
  assert.match(html, /id="app"/);
  assert.match(html, /<section id="builder"/);
  assert.match(html, /<label for="q">/);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /name="viewport"/);
});

test('an empty catalog still renders a valid page', () => {
  const out = renderPage({ index: { ...INDEX, plugins: [] }, assets: ASSETS, csp: CSP });
  assert.ok(out.includes('0 plugins'));
  assert.ok(out.includes('id="static-list"'));
});
