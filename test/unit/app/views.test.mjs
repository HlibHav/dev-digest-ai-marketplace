// Lane 3B: pure helpers and DOM builders of the interactive views, against a minimal DOM double.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseCurated } from '../../../site-src/search/index.js';
import { installLines, truncate, createCard, countContents, contentsEntries, TYPE_LABELS } from '../../../site-src/app/card-view.js';
import { stripTypeWords, effectiveResult, countMessage, describeInterpretation, isListMode, countByType } from '../../../site-src/app/search-view.js';
import { renderTrustCost } from '../../../site-src/app/trust-view.js';
import { createBuilderView, rowNote, isLocked, GUIDANCE } from '../../../site-src/app/builder-view.js';
import { TRUST_NOTICE, trustRows, describeFacts } from '../../../site-src/app/trust-text.js';
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

// ---- restyle: list mode, filter counts, contents, owner chip, install-set box, trust flags ----

test('isListMode: free text gives list rows; the empty query and pure type listings stay a grid', () => {
  assert.equal(isListMode({ terms: ['review'] }), true);
  assert.equal(isListMode({ terms: [] }), false);
  const hit = (type) => ({ doc: { type }, score: 1, terms: [] });
  const typeListing = effectiveResult({ state: 'type-listing', interpretation: { types: ['skill'], terms: [] }, hits: [hit('skill')] }, []);
  assert.equal(isListMode(typeListing), false);
  const text = effectiveResult({ state: 'results', interpretation: { types: [], terms: ['lookup'] }, hits: [hit('skill')] }, []);
  assert.equal(isListMode(text), true);
});

test('countByType counts the hits of each type', () => {
  const hit = (type) => ({ doc: { type } });
  assert.deepEqual(countByType([hit('skill'), hit('skill'), hit('agent')]), { skill: 2, agent: 1 });
  assert.deepEqual(countByType([]), {});
});

test('countContents and contentsEntries describe what a plugin ships, in type order, with plurals', () => {
  const counts = countContents([
    { type: 'plugin', plugin: 'a' }, { type: 'hook', plugin: 'a' }, { type: 'skill', plugin: 'a' }, { type: 'skill', plugin: 'a' }, { type: 'mcp_server', plugin: 'a' }, { type: 'skill', plugin: 'b' },
  ]);
  assert.deepEqual(counts.get('a'), { hook: 1, skill: 2, mcp_server: 1 });
  assert.deepEqual(contentsEntries(counts.get('a')).map((e) => e.text), ['2 skills', '1 hook', '1 MCP server']);
  assert.deepEqual(contentsEntries(undefined), []);
});

const item = (over) => ({ id: 'x', type: 'skill', name: '/beta:review', plugin: 'beta', description: 'd', body: '', tags: [], category: 'review', ...over });
const ctxFor = (extra = {}) => ({ doc: dom(), win: {}, status: noop, plugins: new Map([['beta', { ...plugin, dependencies: [{ name: 'alpha', range: '~1.0.0' }] }]]), ...extra });

test('an artifact card names itself in mono and links to the plugin that installs it', () => {
  const ctx = ctxFor();
  const card = createCard(ctx, { doc: item(), score: 1, terms: [] }, []);
  assert.equal(card.getAttribute('id'), null);
  const title = byTag(card, 'h3')[0];
  assert.match(title.getAttribute('class'), /\bis-mono\b/);
  const chip = byTag(card, 'a');
  assert.equal(chip.length, 1);
  assert.equal(chip[0].getAttribute('href'), '#plugin-beta');
  assert.equal(chip[0].getAttribute('class'), 'owner');
  assert.equal(chip[0].textContent, 'Installs with beta 1.0.0');
});

test('the owner chip hands the click to ctx.reveal and stops the default jump', () => {
  const revealed = [];
  const card = createCard(ctxFor({ reveal: (n) => revealed.push(n) }), { doc: item(), score: 1, terms: [] }, []);
  const chip = byTag(card, 'a')[0];
  let prevented = false;
  (chip.handlers.click ?? []).forEach((fn) => fn({ preventDefault() { prevented = true; } }));
  assert.deepEqual(revealed, ['beta']);
  assert.equal(prevented, true);
});

test('a plugin card has an id to link to, a contents line, requirements and an install-set box', () => {
  const toggles = [];
  const builderCtx = { state: (n) => ({ checked: n === 'beta', locked: false }), toggle: (n, on) => toggles.push([n, on]) };
  const contents = countContents([{ type: 'skill', plugin: 'beta' }, { type: 'skill', plugin: 'beta' }, { type: 'agent', plugin: 'beta' }]);
  const ctx = ctxFor({ contents, builder: builderCtx });
  const card = createCard(ctx, { doc: item({ type: 'plugin', name: 'beta', description: 'Review tooling' }), score: 1, terms: [] }, []);
  assert.equal(card.getAttribute('id'), 'plugin-beta');
  const list = all(card, (e) => e.getAttribute('class') === 'contents');
  assert.equal(list.length, 1);
  assert.equal(list[0].textContent, '2 skills1 agent');
  assert.equal(all(card, (e) => e.getAttribute('class') === 'requires')[0].textContent, 'Requires alpha ~1.0.0');
  const box = all(card, (e) => e.tagName === 'INPUT')[0];
  assert.equal(box.getAttribute('data-add-set'), 'beta');
  assert.equal(box.getAttribute('checked'), '');
  assert.equal(byTag(card, 'details').length, 1);
  assert.equal(byTag(card, 'summary').length, 1);
  box.fire('change');
  assert.deepEqual(toggles, [['beta', undefined]]);
});

test('a locked dependency shows its install-set box ticked and disabled', () => {
  const ctx = ctxFor({ builder: { state: () => ({ checked: true, locked: true }), toggle() {} } });
  const card = createCard(ctx, { doc: item({ type: 'plugin', name: 'beta' }), score: 1, terms: [] }, []);
  const box = all(card, (e) => e.tagName === 'INPUT')[0];
  assert.equal(box.getAttribute('checked'), '');
  assert.equal(box.getAttribute('disabled'), '');
});

test('trust rows carry neutral fact flags and no verdict words', () => {
  const rows = trustRows(plugin.trust);
  assert.deepEqual(rows.map((r) => r.flags), [['broad matcher'], ['non-loopback'], ['scripts']]);
  const quiet = trustRows({ hooks: [{ event: 'Stop', matcher: 'x', broad: false, source_path: 'h.json' }], mcp_servers: [], has_scripts: false, network_urls: [] });
  assert.deepEqual(quiet.map((r) => r.flags), [[]]);
  const words = rows.flatMap((r) => r.flags).join(' ');
  assert.ok(!/safe|danger|risk|unsafe|trusted|score|verified/i.test(words));
});

test('the closed line of the disclosure states the declarations and the always-loaded cost', () => {
  assert.equal(describeFacts(plugin.trust, plugin.cost), 'Declares 1 hook (1 broad), 1 MCP server (1 non-loopback), a scripts/ folder · about 120 tokens always loaded');
  assert.equal(describeFacts({ hooks: [], mcp_servers: [], has_scripts: false, network_urls: [] }, { always_loaded_tokens: 0, on_invocation_tokens: 0 }), 'Declares nothing · no always-loaded content');
});

test('the trust disclosure shows flags as plain text and still has no links', () => {
  const el = renderTrustCost(dom(), plugin);
  const flags = all(el, (e) => e.getAttribute('class') === 'flag').map((e) => e.textContent);
  assert.deepEqual(flags, ['broad matcher', 'non-loopback', 'scripts']);
  assert.equal(byTag(el, 'a').length, 0);
  assert.equal(all(el, (e) => e.getAttribute('class') === 'trust-body').length, 1);
});

test('the builder reports the resolved set, answers state() and toggles from outside', () => {
  const doc = dom();
  const host = doc.createElement('aside');
  const updates = [];
  const view = createBuilderView({ doc, win: {}, host, plugins, selected: [], status: noop, onUpdate: (entries) => updates.push(entries.map((e) => e.name)) });
  assert.deepEqual(updates, [[]]);
  view.toggle('suite', true);
  assert.deepEqual(updates.at(-1), ['suite', 'alpha', 'gamma', 'delta']);
  assert.deepEqual(view.state('gamma'), { checked: true, locked: true });
  assert.deepEqual(view.state('suite'), { checked: true, locked: false });
  assert.deepEqual(view.state('nope'), { checked: false, locked: false });
  view.toggle('nope', true);
  assert.deepEqual(view.selected(), ['suite']);
  view.toggle('suite', false);
  assert.deepEqual(view.state('alpha'), { checked: false, locked: false });
});
