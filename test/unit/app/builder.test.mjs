import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSelection, settingsSnippet, cliCommands, RANGE_NOTE } from '../../../site-src/app/builder.js';

const dep = (name, range = '^1.0.0') => ({ name, range });
// sdd -> a, b, c ; b -> d (nested)
const PLUGINS = [
  { name: 'sdd', dependencies: [dep('a', '^1.0.0'), dep('b', '>=2.0.0'), dep('c', '~1.2.0')] },
  { name: 'a', dependencies: [] },
  { name: 'b', dependencies: [dep('d', '^3.0.0')] },
  { name: 'c', dependencies: [] },
  { name: 'd', dependencies: [] },
  { name: 'solo', dependencies: [] },
  { name: 'loop1', dependencies: [dep('loop2')] },
  { name: 'loop2', dependencies: [dep('loop1')] },
];
const byName = (entries) => Object.fromEntries(entries.map((e) => [e.name, e]));

test('AC-27: selecting a plugin adds 3 dependencies and the nested one, marked automatic, with ranges', () => {
  const { entries } = resolveSelection(PLUGINS, ['sdd']);
  assert.equal(entries.length, 5);
  const e = byName(entries);
  assert.equal(e.sdd.auto, false);
  for (const n of ['a', 'b', 'c', 'd']) assert.equal(e[n].auto, true, n);
  assert.deepEqual(e.a.ranges, [{ from: 'sdd', range: '^1.0.0' }]);
  assert.deepEqual(e.b.ranges, [{ from: 'sdd', range: '>=2.0.0' }]);
  assert.deepEqual(e.d.ranges, [{ from: 'b', range: '^3.0.0' }]);
  assert.deepEqual(e.d.requiredBy, ['b']);
  assert.deepEqual(e.sdd.ranges, []);
  assert.deepEqual(e.sdd.requiredBy, []);
});

test('AC-28: requiredBy lists every selected or added plugin that needs the entry', () => {
  const { entries } = resolveSelection(PLUGINS, ['sdd', 'b']);
  const e = byName(entries);
  assert.equal(e.b.auto, false, 'explicitly selected stays selected');
  assert.deepEqual(e.b.requiredBy, ['sdd']);
  assert.deepEqual(e.b.ranges, [{ from: 'sdd', range: '>=2.0.0' }]);
});

test('selection is idempotent: order, duplicates and re-resolving change nothing', () => {
  const once = resolveSelection(PLUGINS, ['sdd']);
  const twice = resolveSelection(PLUGINS, ['sdd', 'sdd', 'a', 'a']);
  assert.deepEqual(
    twice.entries.map((x) => x.name).sort(),
    once.entries.map((x) => x.name).sort(),
  );
  assert.deepEqual(resolveSelection(PLUGINS, ['sdd']), once);
});

test('unknown names are ignored, dependency cycles terminate, an empty selection is empty', () => {
  assert.deepEqual(resolveSelection(PLUGINS, ['ghost']).entries, []);
  assert.deepEqual(resolveSelection(PLUGINS, []).entries, []);
  const { entries } = resolveSelection(PLUGINS, ['loop1']);
  assert.deepEqual(entries.map((x) => x.name).sort(), ['loop1', 'loop2']);
});

test('AC-29: the settings snippet is valid JSON with the marketplace and every plugin enabled', () => {
  const { entries } = resolveSelection(PLUGINS, ['sdd']);
  const parsed = JSON.parse(settingsSnippet(entries));
  assert.deepEqual(parsed.extraKnownMarketplaces, {
    'dev-digest-ai-marketplace': { source: { source: 'github', repo: 'HlibHav/dev-digest-ai-marketplace' } },
  });
  assert.deepEqual(Object.keys(parsed.enabledPlugins).sort(), [
    'a@dev-digest-ai-marketplace', 'b@dev-digest-ai-marketplace', 'c@dev-digest-ai-marketplace',
    'd@dev-digest-ai-marketplace', 'sdd@dev-digest-ai-marketplace',
  ]);
  assert.ok(Object.values(parsed.enabledPlugins).every((v) => v === true));
});

test('AC-30: CLI commands are the marketplace add line then one install line per plugin', () => {
  const { entries } = resolveSelection(PLUGINS, ['sdd']);
  const lines = cliCommands(entries).split('\n');
  assert.equal(lines[0], '/plugin marketplace add HlibHav/dev-digest-ai-marketplace');
  assert.equal(lines.length, 1 + entries.length);
  for (const [i, e] of entries.entries()) {
    assert.equal(lines[i + 1], `/plugin install ${e.name}@dev-digest-ai-marketplace`);
  }
});

test('AC-31: the range note names the release tag format and says the site does not check ranges', () => {
  assert.match(RANGE_NOTE, /<plugin>--v<semver>/);
  assert.match(RANGE_NOTE, /install time/);
  assert.match(RANGE_NOTE, /not checked by the site/);
});

test('AC-32 support: empty entries produce empty strings', () => {
  assert.equal(settingsSnippet([]), '');
  assert.equal(cliCommands([]), '');
});
