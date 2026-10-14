// Compatibility and changelog facts on the plugin card: shown when the index has them, absent-safe, escaped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compatibilityText, whatsNew } from '../../site-src/app/plugin-facts.js';
import { renderPage } from '../../scripts/lib/render/page.mjs';

const base = { name: 'p', version: '1.2.0', description: 'd', category: 'c', tags: [], dependencies: [], install_commands: [] };
const withFacts = {
  ...base,
  compatibility: { claudeCode: '>=2.0.0' },
  changelog: [{ version: '1.2.0', date: '2026-10-01', notes: 'Adds <b>x</b>\nFixes y' }, { version: '1.1.0', date: null, notes: 'old' }],
};

test('absent fields give nothing', () => {
  assert.equal(compatibilityText(base), null);
  assert.equal(compatibilityText({ ...base, compatibility: null }), null);
  assert.equal(whatsNew(base), null);
  assert.equal(whatsNew({ ...base, changelog: [] }), null);
});

test('present fields give the compatibility line and the first note of the newest entry', () => {
  assert.equal(compatibilityText(withFacts), 'Requires Claude Code >=2.0.0');
  assert.deepEqual(whatsNew(withFacts), { title: "What's new in 1.2.0", note: 'Adds <b>x</b>' });
});

test('the static page shows both lines, escaped, and renders without them', () => {
  const assets = { css: [], js: [], indexUrl: 'index.json' };
  const html = renderPage({ index: { marketplace: 'm', plugins: [withFacts], artifacts: [] }, assets, csp: "default-src 'none'" });
  assert.ok(html.includes('Requires Claude Code &gt;=2.0.0'));
  assert.ok(html.includes('What&#39;s new in 1.2.0'));
  assert.ok(html.includes('Adds &lt;b&gt;x&lt;/b&gt;'));
  assert.ok(!html.includes('<b>x</b>'));
  const plain = renderPage({ index: { marketplace: 'm', plugins: [base], artifacts: [] }, assets, csp: "default-src 'none'" });
  assert.ok(!plain.includes('Claude Code'));
  assert.ok(!plain.includes('whats-new'));
});
