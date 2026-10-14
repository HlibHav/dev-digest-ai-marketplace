import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeMarketplace } from '../../helpers/make-marketplace.mjs';
import { agentName, commandName, hookName, mcpName, skillName } from '../../../scripts/lib/names.mjs';
import { discoverFileArtifacts } from '../../../scripts/lib/discover.mjs';
import { BuildError } from '../../../scripts/lib/errors.mjs';

const tmp = () => mkdtempSync(join(tmpdir(), 'names-'));

test('namespaces skill, command, agent, MCP server and hook', () => {
  assert.equal(skillName('demo', 'review'), '/demo:review');
  assert.equal(skillName('demo', 'x', 'audit'), '/demo:audit');
  assert.equal(commandName('demo', 'ping.md'), '/demo:ping');
  assert.equal(commandName('demo', 'ops/deploy.md'), '/demo:ops:deploy');
  assert.equal(commandName('demo', 'a/b/c.md'), '/demo:a:b:c');
  assert.equal(agentName('demo', 'scout'), 'demo:scout');
  assert.equal(mcpName('demo', 'local-tool'), 'demo/local-tool');
  assert.equal(hookName('demo', 'PreToolUse', 0), 'demo/PreToolUse#0');
  assert.equal(hookName('demo', 'PreToolUse', 3), 'demo/PreToolUse#3');
});

test('frontmatter name wins and source keeps the folder', () => {
  const dir = tmp();
  try {
    makeMarketplace(dir, {
      plugins: [{
        name: 'demo',
        files: {
          'skills/review/SKILL.md': '---\ndescription: Reviews things\n---\n# Review\nBody.\n',
          'skills/x/SKILL.md': '---\nname: audit\ndescription: Audits things\n---\nAudit body.\n',
          'commands/ops/deploy.md': '---\ndescription: Deploy checklist\n---\nPrint it.\n',
        },
      }],
    });
    const found = discoverFileArtifacts(join(dir, 'plugins', 'demo'), 'demo', { root: dir });
    const byName = Object.fromEntries(found.map((a) => [a.name, a]));
    assert.deepEqual(Object.keys(byName).sort(), ['/demo:audit', '/demo:ops:deploy', '/demo:review']);
    assert.equal(byName['/demo:audit'].source_path, 'plugins/demo/skills/x/SKILL.md');
    assert.equal(byName['/demo:audit'].type, 'skill');
    assert.equal(byName['/demo:audit'].plugin, 'demo');
    assert.equal(byName['/demo:review'].source_path, 'plugins/demo/skills/review/SKILL.md');
    assert.equal(byName['/demo:ops:deploy'].type, 'command');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('discovery returns type, short name, description and the full trimmed body', () => {
  const dir = tmp();
  try {
    const long = 'z'.repeat(9000);
    makeMarketplace(dir, {
      plugins: [{
        name: 'demo',
        files: {
          'skills/big/SKILL.md': `---\ndescription: Big one\n---\n\n${long}\n`,
          'agents/scout.md': '---\ndescription: Scouts\n---\nScout body\n',
          'agents/named.md': '---\nname: renamed\ndescription: Named agent\n---\nBody\n',
          'commands/ping.md': 'Reply pong.\n\nSecond paragraph.\n',
        },
      }],
    });
    const found = discoverFileArtifacts(join(dir, 'plugins', 'demo'), 'demo', { root: dir });
    const by = Object.fromEntries(found.map((a) => [a.name, a]));
    assert.equal(by['/demo:big'].body, long);
    assert.equal(by['/demo:big'].short_name, 'big');
    assert.equal(by['demo:scout'].type, 'agent');
    assert.equal(by['demo:scout'].short_name, 'scout');
    assert.ok(by['demo:renamed'], 'agent name from frontmatter');
    // A command without frontmatter: description falls back to the first non-empty body line.
    assert.equal(by['/demo:ping'].description, 'Reply pong.');
    assert.equal(by['/demo:ping'].short_name, 'ping');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('command description fallback is capped at 200 characters', () => {
  const dir = tmp();
  try {
    makeMarketplace(dir, { plugins: [{ name: 'demo', files: { 'commands/long.md': `${'w'.repeat(500)}\n` } }] });
    const [c] = discoverFileArtifacts(join(dir, 'plugins', 'demo'), 'demo', { root: dir });
    assert.equal(c.description.length, 200);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a plugin with no skills, agents or commands yields nothing', () => {
  const dir = tmp();
  try {
    makeMarketplace(dir, { plugins: [{ name: 'empty' }] });
    assert.deepEqual(discoverFileArtifacts(join(dir, 'plugins', 'empty'), 'empty', { root: dir }), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('discovery order is stable: skills, agents, commands, each sorted by path', () => {
  const dir = tmp();
  try {
    const fm = (d) => `---\ndescription: ${d}\n---\nb\n`;
    makeMarketplace(dir, {
      plugins: [{
        name: 'demo',
        files: {
          'skills/b/SKILL.md': fm('b'), 'skills/a/SKILL.md': fm('a'),
          'agents/z.md': fm('z'), 'agents/y.md': fm('y'),
          'commands/q.md': fm('q'),
        },
      }],
    });
    const names = discoverFileArtifacts(join(dir, 'plugins', 'demo'), 'demo', { root: dir }).map((a) => a.name);
    assert.deepEqual(names, ['/demo:a', '/demo:b', 'demo:y', 'demo:z', '/demo:q']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('AC-5 skill and agent frontmatter rules throw BuildError naming the file', () => {
  const cases = [
    ['skills/s/SKILL.md', '# no frontmatter at all\n', /description/],
    ['skills/s/SKILL.md', '---\nname: s\n---\nbody\n', /description/],
    ['skills/s/SKILL.md', '---\ndescription: "  "\n---\nbody\n', /description/],
    ['agents/a.md', 'no frontmatter here\n', /frontmatter/],
    ['agents/a.md', '---\nname: a\n---\nbody\n', /description/],
  ];
  for (const [rel, content, rule] of cases) {
    const dir = tmp();
    try {
      makeMarketplace(dir, { plugins: [{ name: 'demo', files: { [rel]: content } }] });
      assert.throws(
        () => discoverFileArtifacts(join(dir, 'plugins', 'demo'), 'demo', { root: dir }),
        (e) => e instanceof BuildError && e.file === `plugins/demo/${rel}` && rule.test(e.rule),
        `${rel}: ${JSON.stringify(content)}`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});
