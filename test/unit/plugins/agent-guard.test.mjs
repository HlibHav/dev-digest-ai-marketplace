import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const GUARD = join(root, 'plugins/engineering-paved-path/scripts/agent-guard.py');
const ARGS = ['--agent', 'plan-verifier=readonly', '--agent', 'spec-creator=specs', '--agent', 'implementation-planner=planner'];

const withProject = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'guard-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

function run(dir, input) {
  const r = spawnSync('python3', [GUARD, ...ARGS], {
    input: typeof input === 'string' ? input : JSON.stringify({ cwd: dir, ...input }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput : null;
}

const denied = (out) => out?.permissionDecision === 'deny';

test('main session and unguarded agents pass silently', () => withProject((dir) => {
  assert.equal(run(dir, { tool_name: 'Write', tool_input: { file_path: 'x.ts' } }), null);
  assert.equal(run(dir, { agent_type: 'Explore', tool_name: 'Write', tool_input: { file_path: 'x.ts' } }), null);
  assert.equal(run(dir, { agent_type: 'other-plugin:implementer', tool_name: 'Bash', tool_input: { command: 'rm -rf /' } }), null);
}));

test('readonly agent cannot write, under its plugin-scoped or bare name', () => withProject((dir) => {
  for (const agent_type of ['sdd-engineering:plan-verifier', 'plan-verifier']) {
    for (const tool_name of ['Write', 'Edit', 'MultiEdit', 'NotebookEdit']) {
      assert.ok(denied(run(dir, { agent_type, tool_name, tool_input: { file_path: 'src/a.ts' } })), `${agent_type} ${tool_name}`);
    }
  }
}));

test('readonly agent may run read-only git only', () => withProject((dir) => {
  const a = { agent_type: 'sdd-engineering:plan-verifier', tool_name: 'Bash' };
  for (const command of ['git diff main...HEAD', 'git log --oneline -5', 'git -C sub status --porcelain', 'git branch --show-current', 'git merge-base HEAD origin/main']) {
    assert.equal(run(dir, { ...a, tool_input: { command } }), null, command);
  }
  for (const command of ['git commit -m x', 'git push', 'git branch evil', 'git diff --output=/tmp/x', 'git checkout .', 'git grep -Oevil foo', 'git -c core.pager=evil log', 'rm -rf src']) {
    assert.ok(denied(run(dir, { ...a, tool_input: { command } })), command);
  }
}));

test('readonly agent rejects chaining, pipes, redirects and substitution', () => withProject((dir) => {
  const a = { agent_type: 'plan-verifier', tool_name: 'Bash' };
  for (const command of ['git status; rm -rf x', 'git status && touch x', 'git log | tee x', 'git diff > out', 'git show $(whoami)', 'git log `id`']) {
    assert.ok(denied(run(dir, { ...a, tool_input: { command } })), command);
  }
}));

test('readonly agent may run the project check commands it declares', () => withProject((dir) => {
  mkdirSync(join(dir, '.claude'));
  writeFileSync(join(dir, '.claude/agent-guard.json'), JSON.stringify({ checkCommands: ['npm test', 'pnpm --dir server typecheck'] }));
  const a = { agent_type: 'plan-verifier', tool_name: 'Bash' };
  assert.equal(run(dir, { ...a, tool_input: { command: 'npm test' } }), null);
  assert.equal(run(dir, { ...a, tool_input: { command: 'npm test -- --grep foo' } }), null);
  assert.equal(run(dir, { ...a, tool_input: { command: 'pnpm --dir server typecheck' } }), null);
  assert.ok(denied(run(dir, { ...a, tool_input: { command: 'npm install evil' } })));
  assert.ok(denied(run(dir, { ...a, tool_input: { command: 'pnpm --dir client typecheck' } })));
}));

test('specs agent writes only Markdown under a specs directory, and runs no shell', () => withProject((dir) => {
  const a = { agent_type: 'sdd-engineering:spec-creator' };
  for (const file_path of ['specs/2026-10-14-x.md', 'server/specs/README.md', join(dir, 'specs/a.md')]) {
    assert.equal(run(dir, { ...a, tool_name: 'Write', tool_input: { file_path } }), null, file_path);
  }
  for (const file_path of ['src/a.md', 'specs/a.ts', 'specs/../src/a.md', '/etc/specs/a.md', 'docs/plans/x.md']) {
    assert.ok(denied(run(dir, { ...a, tool_name: 'Edit', tool_input: { file_path } })), file_path);
  }
  assert.ok(denied(run(dir, { ...a, tool_name: 'Bash', tool_input: { command: 'git status' } })));
}));

test('planner neither writes nor runs commands', () => withProject((dir) => {
  const a = { agent_type: 'sdd-engineering:implementation-planner' };
  assert.ok(denied(run(dir, { ...a, tool_name: 'Write', tool_input: { file_path: 'specs/a.md' } })));
  assert.ok(denied(run(dir, { ...a, tool_name: 'Bash', tool_input: { command: 'git status' } })));
  assert.equal(run(dir, { ...a, tool_name: 'Read', tool_input: { file_path: 'a.ts' } }), null);
}));

test('malformed input for a guarded agent denies; unparseable stdin passes', () => withProject((dir) => {
  assert.ok(denied(run(dir, { agent_type: 'plan-verifier', tool_name: 'Bash', tool_input: 'git status' })));
  assert.equal(run(dir, 'not json'), null);
}));
