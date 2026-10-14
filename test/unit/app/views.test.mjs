// Lane 3B: pure helpers and DOM builders of the interactive views, against a minimal DOM double.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseCurated } from '../../../site-src/search/index.js';
import { installLines, truncate, createCard, TYPE_LABELS } from '../../../site-src/app/card-view.js';
import { stripTypeWords, effectiveResult, countMessage, describeInterpretation } from '../../../site-src/app/search-view.js';
import { renderTrustCost } from '../../../site-src/app/trust-view.js';
import { createBuilderView, rowNote, isLocked, GUIDANCE } from '../../../site-src/app/builder-view.js';
import { TRUST_NOTICE } from '../../../site-src/app/trust-text.js';
import { COST_NOTICE } from '../../../site-src/app/cost-text.js';
import { fakeDocument } from './fake-dom.mjs';

const data = (name) => readFileSync(fileURLToPath(new URL(`../../../data/${name}`, import.meta.url)), 'utf8');
const curated = parseCurated({
  dictionary: data('dictionary.ua-en.txt'),
  stopUk: data('stopwords.uk.txt'),
  stopEn: data('stopwords.en.txt'),
  typewords: data('typewords.txt'),
});

// fake-dom has no events, style or replaceChildren; add just those.
function dom() {
  const doc = fakeDocument();
  const make = doc.createElement;
  doc.createElement = (tag) => {
    const el = make(tag);
    el.handlers = {};
    el.addEventListener = (name, fn) => { (el.handlers[name] ??= []).push(fn); };
    el.fire = (name) => (el.handlers[name] ?? []).forEach((fn) => fn({ preventDefault() {} }));
    el.style = { props: {}, setProperty(k, v) { this.props[k] = v; } };
    el.replaceChildren = (...kids) => { el.childNodes = []; el.append(...kids); };
    return el;
  };
  return doc;
}
const walk = (el, out = []) => {
  out.push(el);
  for (const c of el.childNodes ?? []) if (c.nodeType === 1) walk(c, out);
  return out;
};
const all = (el, pred) => walk(el).filter(pred);
const byTag = (el, tag) => all(el, (e) => e.tagName === tag.toUpperCase());
const noop = { copied() {}, manual() {}, count() {} };

test('AC-21: the copied text is the marketplace line and the plugin install line', () => {
  assert.deepEqual(installLines('alpha'), [
    '/plugin marketplace add HlibHav/dev-digest-ai-marketplace',
    '/plugin install alpha@dev-digest-ai-marketplace',
  ]);
});

test('truncate cuts long text on code points and leaves short text alone', () => {
  assert.equal(truncate('short', 10), 'short');
  assert.equal(truncate('abcdefghij', 4), 'abcd…');
  assert.equal(truncate('😀😀😀😀', 2), '😀😀…');
});

test('AC-19: stripTypeWords removes only type words, in any language and inflection', () => {
  assert.equal(stripTypeWords('skill zzzzqq', curated), 'zzzzqq');
  assert.equal(stripTypeWords('скіли для рев\'ю', curated), 'для рев\'ю');
  assert.equal(stripTypeWords('агенти', curated), '');
  assert.equal(stripTypeWords('architecture review', curated), 'architecture review');
});

test('effectiveResult filters by the checkbox types and picks the state to show', () => {
  const hit = (type) => ({ doc: { type }, score: 1, terms: [] });
  const base = { state: 'empty-query', interpretation: { types: [], terms: [] }, hits: [hit('skill'), hit('agent')] };
  assert.equal(effectiveResult(base, []).state, 'empty-query');
  const onlyAgents = effectiveResult(base, ['agent']);
  assert.equal(onlyAgents.state, 'type-listing');
  assert.equal(onlyAgents.hits.length, 1);
  const none = effectiveResult(base, ['hook']);
  assert.equal(none.state, 'no-results');
  assert.deepEqual(none.types, ['hook']);
  const empty = effectiveResult({ ...base, hits: [] }, []);
  assert.equal(empty.state, 'empty-query');
  const noRes = effectiveResult({ state: 'no-results', interpretation: { types: ['skill'], terms: ['zzzzqq'] }, hits: [] }, []);
  assert.deepEqual([noRes.state, noRes.types, noRes.terms], ['no-results', ['skill'], ['zzzzqq']]);
});

test('AC-47: countMessage covers every state', () => {
  assert.equal(countMessage('no-results', 0), 'No results');
  assert.equal(countMessage('results', 1), '1 result');
  assert.equal(countMessage('type-listing', 3), '3 results');
  assert.equal(countMessage('empty-query', 17), 'Showing the full catalog: 17 entries');
  assert.equal(countMessage('results', 250, 100), '250 results, showing the first 100');
});

test('AC-19: describeInterpretation restates type and text terms', () => {
  assert.equal(describeInterpretation(['skill'], ['zzzzqq']), 'type skill, text zzzzqq');
  assert.equal(describeInterpretation(['mcp_server'], []), 'type MCP server');
  assert.equal(describeInterpretation([], []), '');
});

const plugin = {
  name: 'beta', version: '1.0.0', description: 'Review tooling', category: 'review', tags: [],
  dependencies: [], install_commands: [],
  trust: {
    hooks: [{ event: 'PreToolUse', matcher: null, broad: true, source_path: 'plugins/beta/hooks/hooks.json' }],
    mcp_servers: [{ name: 'beta/remote', transport: 'url', url: 'https://example.com/mcp', args: [], non_loopback: true, source_path: 'plugins/beta/.mcp.json' }],
    has_scripts: true,
    network_urls: ['https://example.com/mcp'],
  },
  cost: { always_loaded_tokens: 120, on_invocation_tokens: 3400, method: 'characters / 4, rounded up', excluded: [] },
};

test('AC-36, AC-39: trust and cost render as plain text with the notices and no links', () => {
  const doc = dom();
  const el = renderTrustCost(doc, plugin);
  assert.equal(el.tagName, 'DETAILS');
  assert.equal(byTag(el, 'a').length, 0);
  assert.ok(el.textContent.includes(TRUST_NOTICE));
  assert.ok(el.textContent.includes(COST_NOTICE));
  assert.ok(el.textContent.includes('(non-loopback)'));
  assert.ok(el.textContent.includes('about 3,400 tokens (estimate)'));
  const code = byTag(el, 'code');
  assert.deepEqual(code.map((c) => c.textContent), ['https://example.com/mcp']);
});

test('AC-37, AC-40: an empty plugin says so', () => {
  const doc = dom();
  const el = renderTrustCost(doc, { ...plugin, trust: { hooks: [], mcp_servers: [], has_scripts: false, network_urls: [] }, cost: { always_loaded_tokens: 0, on_invocation_tokens: 0 } });
  assert.ok(el.textContent.includes('declares no hooks, MCP servers or scripts'));
  assert.ok(el.textContent.includes('0 tokens (no loaded content)'));
});

test('AC-20, AC-24: a card shows type, name, plugin, description and a copy button, and text stays text', () => {
  const doc = dom();
  const evil = '<script>window.__x=1</script>';
  const item = { id: 'skill:delta:/delta:inject', type: 'skill', name: '/delta:inject', plugin: 'delta', description: evil, body: '', tags: [], category: 'research' };
  const card = createCard({ doc, win: {}, status: noop, plugins: new Map() }, { doc: item, score: 1, terms: ['script'] }, []);
  assert.equal(card.getAttribute('data-card'), '');
  assert.equal(card.getAttribute('data-type'), 'skill');
  assert.equal(card.getAttribute('data-plugin'), 'delta');
  assert.equal(card.style.props['--type-color'], 'var(--type-skill)');
  assert.equal(card.getAttribute('style'), null);
  assert.equal(byTag(card, 'script').length, 0);
  assert.equal(byTag(card, 'img').length, 0);
  assert.ok(card.textContent.includes(evil));
  assert.ok(card.textContent.includes('skill'));
  assert.ok(card.textContent.includes('/delta:inject'));
  assert.ok(byTag(card, 'mark').length >= 1);
  const buttons = byTag(card, 'button');
  assert.equal(buttons.length, 1);
  assert.match(buttons[0].getAttribute('aria-label'), /^Copy install commands for/);
  assert.equal(byTag(card, 'details').length, 0, 'artifact cards carry no trust block');
});

test('a plugin card carries the trust and cost details', () => {
  const doc = dom();
  const item = { id: 'plugin:beta', type: 'plugin', name: 'beta', plugin: 'beta', description: 'Review tooling', body: '', tags: [], category: 'review' };
  const card = createCard({ doc, win: {}, status: noop, plugins: new Map([['beta', plugin]]) }, { doc: item, score: 1, terms: [] }, []);
  assert.equal(byTag(card, 'details').length, 1);
  assert.ok(card.textContent.includes('v1.0.0'));
  assert.equal(TYPE_LABELS.mcp_server, 'MCP server');
});

test('AC-59: with no Clipboard API the card shows the text to copy by hand', async () => {
  const doc = dom();
  const messages = [];
  const item = { id: 'plugin:beta', type: 'plugin', name: 'beta', plugin: 'beta', description: 'x', body: '', tags: [], category: 'c' };
  const card = createCard({ doc, win: { navigator: {} }, status: { ...noop, manual: () => messages.push('manual') }, plugins: new Map() }, { doc: item, score: 1, terms: [] }, []);
  const button = byTag(card, 'button')[0];
  button.fire('click');
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(messages, ['manual']);
  const pre = byTag(card, 'pre');
  assert.equal(pre.length, 1);
  assert.equal(pre[0].textContent, installLines('beta').join('\n'));
});

const plugins = [
  { name: 'alpha', version: '1.0.0', dependencies: [] },
  { name: 'gamma', version: '0.3.2', dependencies: [{ name: 'delta', range: '~0.2.0' }] },
  { name: 'delta', version: '0.2.1', dependencies: [] },
  { name: 'suite', version: '1.0.0', dependencies: [{ name: 'alpha', range: '~1.0.0' }, { name: 'gamma', range: '~0.3.0' }] },
];

function builder(selected = []) {
  const doc = dom();
  const host = doc.createElement('section');
  host.hidden = true;
  const changes = [];
  const view = createBuilderView({ doc, win: {}, host, plugins, selected, status: noop, onChange: (s) => changes.push(s) });
  const inputs = Object.fromEntries(all(host, (e) => e.tagName === 'INPUT').map((i) => [i.getAttribute('value'), i]));
  return { host, view, inputs, changes };
}
const copyButtons = (host) => byTag(host, 'button');

test('AC-32: nothing selected shows guidance and no copy buttons', () => {
  const { host } = builder();
  assert.equal(host.hidden, false);
  assert.ok(host.textContent.includes(GUIDANCE));
  assert.equal(copyButtons(host).length, 0);
});

test('AC-28: dependencies stay ticked and locked while a dependent is selected', () => {
  const { host, inputs, changes } = builder();
  inputs.suite.checked = true;
  inputs.suite.fire('change');
  assert.deepEqual(changes, [['suite']]);
  for (const name of ['alpha', 'gamma', 'delta']) {
    assert.equal(inputs[name].checked, true, `${name} ticked`);
    assert.equal(inputs[name].disabled, true, `${name} locked`);
  }
  assert.equal(inputs.suite.disabled, false);
  assert.ok(host.textContent.includes('added automatically, required by suite'));
  assert.ok(host.textContent.includes('required by gamma'));
  inputs.suite.checked = false;
  inputs.suite.fire('change');
  for (const name of ['alpha', 'gamma', 'delta', 'suite']) {
    assert.equal(inputs[name].checked, false);
    assert.equal(inputs[name].disabled, false);
  }
  assert.ok(host.textContent.includes(GUIDANCE));
});

test('AC-27, AC-30, AC-31: the set shows ranges and the note, with two copy buttons', () => {
  const { host } = builder(['suite']);
  const text = host.textContent;
  assert.ok(text.includes('~0.2.0 (declared by gamma)'));
  assert.ok(text.includes('resolve against <plugin>--v<semver> release tags'));
  assert.equal(copyButtons(host).length, 2);
  assert.deepEqual(copyButtons(host).map((b) => b.getAttribute('data-copy')), ['commands', 'snippet']);
  const pres = byTag(host, 'pre').map((p) => p.textContent);
  assert.ok(pres[0].startsWith('/plugin marketplace add HlibHav/dev-digest-ai-marketplace\n'));
  assert.deepEqual(Object.keys(JSON.parse(pres[1]).enabledPlugins), [
    'suite@dev-digest-ai-marketplace', 'alpha@dev-digest-ai-marketplace', 'gamma@dev-digest-ai-marketplace', 'delta@dev-digest-ai-marketplace',
  ]);
});

test('selection from the URL ignores unknown plugin names; rowNote and isLocked', () => {
  const { inputs, view } = builder(['nope', 'alpha']);
  assert.deepEqual(view.selected(), ['alpha']);
  assert.equal(inputs.alpha.checked, true);
  assert.equal(rowNote(undefined), '');
  assert.equal(rowNote({ auto: false, requiredBy: [] }), '');
  assert.equal(isLocked({ requiredBy: [] }), false);
  assert.equal(isLocked({ requiredBy: ['x'] }), true);
});
