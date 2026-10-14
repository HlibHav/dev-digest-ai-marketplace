import test from 'node:test';
import assert from 'node:assert/strict';
import { assertUniqueNames, findCycle, normalizeDependencies, validateDependencies } from '../../../scripts/lib/deps.mjs';
import { BuildError } from '../../../scripts/lib/errors.mjs';

const plugin = (name, dependencies) => ({ name, file: `plugins/${name}/.claude-plugin/plugin.json`, dependencies });
const dep = (name, version = '~1.0.0') => ({ name, version });

test('a valid graph passes', () => {
  validateDependencies([plugin('a', [dep('b'), dep('c', '~0.3.0')]), plugin('b', [dep('c', '~0.3.0')]), plugin('c', undefined)]);
});

test('normalizeDependencies maps version to range and defaults to none', () => {
  assert.deepEqual(normalizeDependencies(undefined, 'f'), []);
  assert.deepEqual(normalizeDependencies([dep('b', '~1.2.3')], 'f'), [{ name: 'b', range: '~1.2.3' }]);
});

const throwsBuild = (fn, file, rule) =>
  assert.throws(fn, (e) => e instanceof BuildError && e.file === file && rule.test(e.rule), `expected ${file} / ${rule}`);

test('dependency naming a plugin that is not in the catalog', () => {
  throwsBuild(() => validateDependencies([plugin('a', [dep('ghost')])]), 'plugins/a/.claude-plugin/plugin.json', /"ghost".*not in the catalog/);
});

test('dependency cycle names the path', () => {
  throwsBuild(
    () => validateDependencies([plugin('a', [dep('b')]), plugin('b', [dep('c')]), plugin('c', [dep('a')])]),
    'plugins/a/.claude-plugin/plugin.json',
    /cycle: a -> b -> c -> a/,
  );
});

test('a plugin depending on itself is a cycle', () => {
  throwsBuild(() => validateDependencies([plugin('a', [dep('a')])]), 'plugins/a/.claude-plugin/plugin.json', /cycle: a -> a/);
});

test('non-semver range', () => {
  for (const v of ['~1.0', '~latest', '~1.x.0', '~', '']) {
    throwsBuild(() => validateDependencies([plugin('a', [dep('b', v)]), plugin('b')]), 'plugins/a/.claude-plugin/plugin.json', /not a semver/);
  }
});

test('range that is semver but not a ^ or ~ range', () => {
  for (const v of ['1.0.0', '>=1.0.0', '<2.0.0', '=1.0.0']) {
    throwsBuild(() => validateDependencies([plugin('a', [dep('b', v)]), plugin('b')]), 'plugins/a/.claude-plugin/plugin.json', /~/);
  }
});

test('a range with no version at all', () => {
  throwsBuild(() => validateDependencies([plugin('a', [{ name: 'b' }]), plugin('b')]), 'plugins/a/.claude-plugin/plugin.json', /version/);
});

test('a plain name without a range is a bare string', () => {
  throwsBuild(() => validateDependencies([plugin('a', ['b']), plugin('b')]), 'plugins/a/.claude-plugin/plugin.json', /bare string/);
  throwsBuild(() => validateDependencies([plugin('a', ['@^1.0.0']), plugin('b')]), 'plugins/a/.claude-plugin/plugin.json', /bare string/);
});

test('^ ranges are accepted in both spellings', () => {
  assert.deepEqual(normalizeDependencies([dep('b', '^1.2.3')], 'f'), [{ name: 'b', range: '^1.2.3' }]);
  assert.deepEqual(normalizeDependencies(['b@dev-digest-ai-marketplace@^1.2.3', 'c@^0.3.0'], 'f'), [
    { name: 'b', range: '^1.2.3' },
    { name: 'c', range: '^0.3.0' },
  ]);
  validateDependencies([plugin('a', ['b@m@^1.0.0']), plugin('b', [dep('c', '^2.0.0')]), plugin('c')]);
});

test('string spelling is checked like the object spelling', () => {
  const f = 'plugins/a/.claude-plugin/plugin.json';
  throwsBuild(() => validateDependencies([plugin('a', ['ghost@m@^1.0.0'])]), f, /"ghost".*not in the catalog/);
  throwsBuild(() => validateDependencies([plugin('a', ['b@m@1.0.0']), plugin('b')]), f, /\^/);
  throwsBuild(() => validateDependencies([plugin('a', ['b@m@^1.x']), plugin('b')]), f, /not a semver/);
  throwsBuild(() => validateDependencies([plugin('a', ['b@m@^1.0.0']), plugin('b', ['a@m@^1.0.0'])]), f, /cycle: a -> b -> a/);
});

test('findCycle returns the cycle path or null', () => {
  assert.equal(findCycle(new Map([['a', ['b']], ['b', []]])), null);
  assert.deepEqual(findCycle(new Map([['a', ['b']], ['b', ['a']]])), { cycle: 'a -> b -> a', root: 'a' });
});

test('dependencies that is not an array, and an entry without a name', () => {
  throwsBuild(() => validateDependencies([plugin('a', { b: '~1.0.0' })]), 'plugins/a/.claude-plugin/plugin.json', /array/);
  throwsBuild(() => validateDependencies([plugin('a', [{ version: '~1.0.0' }])]), 'plugins/a/.claude-plugin/plugin.json', /name/);
});

test('duplicate plugin names in the catalog', () => {
  throwsBuild(() => validateDependencies([plugin('a'), plugin('a')]), 'plugins/a/.claude-plugin/plugin.json', /duplicate plugin/);
});

test('assertUniqueNames names the second file and the first', () => {
  assertUniqueNames([{ name: 'x', source_path: 'one' }, { name: 'y', source_path: 'two' }]);
  throwsBuild(
    () => assertUniqueNames([{ name: '/p:x', source_path: 'plugins/p/skills/a/SKILL.md' }, { name: '/p:x', source_path: 'plugins/p/skills/b/SKILL.md' }]),
    'plugins/p/skills/b/SKILL.md',
    /duplicate name "\/p:x".*plugins\/p\/skills\/a\/SKILL\.md/,
  );
});
