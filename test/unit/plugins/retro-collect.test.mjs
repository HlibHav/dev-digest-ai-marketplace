import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const COLLECT = join(root, 'plugins/sdd-engineering/skills/workflow-retro/scripts/collect.py');
const FIXTURES = join(here, 'fixtures/retro-sessions');
const RUN_START = '2026-10-15T09:00:00Z';

// A project dir with a finished run (3 Agent launches) and a later retro session with none.
// The retro file is the newest, as it is when the retro collects its own run.
const withProject = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'retro-'));
  try {
    cpSync(FIXTURES, dir, { recursive: true });
    utimesSync(join(dir, 'run-0001.jsonl'), new Date('2026-10-15T09:20:00Z'), new Date('2026-10-15T09:20:00Z'));
    utimesSync(join(dir, 'retro-0002.jsonl'), new Date('2026-10-15T10:00:30Z'), new Date('2026-10-15T10:00:30Z'));
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const collect = (dir, ...args) => spawnSync('python3', [COLLECT, '--project-dir', dir, ...args], { encoding: 'utf8' });

test('--since without --session finds the run in an older transcript, not the retro session', () => withProject((dir) => {
  const r = collect(dir, '--since', RUN_START, '--json');
  assert.equal(r.status, 0, r.stderr);
  const { runs } = JSON.parse(r.stdout);
  assert.equal(runs.length, 1);
  assert.match(runs[0].session, /run-0001\.jsonl$/);
  assert.equal(runs[0].launches.length, 3);
  assert.deepEqual(runs[0].agents.slice(1).map((a) => a.type),
    ['sdd-engineering:spec-creator', 'sdd-engineering:implementation-planner', 'sdd-engineering:implementer']);
}));

test('--since Markdown report names the run session and its three agents', () => withProject((dir) => {
  const r = collect(dir, '--since', RUN_START);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /run-0001\.jsonl/);
  assert.doesNotMatch(r.stdout, /retro-0002/);
  assert.match(r.stdout, /Agents launched: 3/);
}));

test('a --since without a timezone is read as UTC', () => withProject((dir) => {
  const r = collect(dir, '--since', '2026-10-15T09:00:00', '--json');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).runs.length, 1);
}));

test('--since after the run reports that no multi-agent run was found', () => withProject((dir) => {
  const r = collect(dir, '--since', '2026-10-15T09:30:00Z');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /no multi-agent run/);
}));

test('--session keeps reading exactly that transcript', () => withProject((dir) => {
  const r = collect(dir, '--session', 'retro-0002', '--json');
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.match(out.session, /retro-0002\.jsonl$/);
  assert.equal(out.launches.length, 0);
}));
