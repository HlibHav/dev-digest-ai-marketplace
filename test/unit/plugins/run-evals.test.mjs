import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildClaudeArgs, evalEnv, evaluateAssertions, extractMetrics, formatTable, globToRegex, median, parseArgs,
  parseStream, probeVerdict, slashSkillFromPrompt, selectCases, snapshotFiles, summarize, toRegex,
} from '../../../scripts/run-evals.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const STREAM = readFileSync(join(here, 'fixtures/eval-stream.jsonl'), 'utf8');
const failed = (results) => results.filter((r) => !r.ok).map((r) => r.name);

test('parseStream collects dispatches, skills, text and the result event', () => {
  const p = parseStream(STREAM);
  assert.equal(p.badLines, 1);
  assert.deepEqual(p.dispatched, ['sdd-engineering:spec-creator', 'sdd-engineering:implementer']);
  assert.deepEqual(p.skills, ['sdd-engineering:run-plan', 'engineering-paved-path:sdd-cascade']);
  assert.deepEqual(p.assistantText, ['Dispatching the spec agent.']);
  assert.equal(p.finalText, 'Done. Questions: which range?');
  assert.ok(p.toolUses.find((t) => t.name === 'Write')?.nested);
  assert.equal(p.init.agents.length, 3);
});

test('extractMetrics reads cost, tokens, turns and latency', () => {
  const m = extractMetrics(parseStream(STREAM));
  assert.deepEqual(m, {
    costUsd: 0.0421, inputTokens: 10, outputTokens: 500, cacheReadTokens: 30000, cacheCreationTokens: 2000,
    turns: 5, durationMs: 12345, durationApiMs: 11000, models: ['claude-haiku-5-5'], modelCostsUsd: { 'claude-haiku-5-5': 0.0421 }, subagentsSpawned: 2,
  });
});

test('slashSkillFromPrompt resolves only listed slash commands', () => {
  const init = parseStream(STREAM).init;
  assert.equal(slashSkillFromPrompt('/sdd-engineering:run-plan docs/plans/x.md', init), 'sdd-engineering:run-plan');
  assert.equal(slashSkillFromPrompt('/nope:thing', init), null);
  assert.equal(slashSkillFromPrompt('use /sdd-engineering:run-plan', init), null);
  assert.equal(slashSkillFromPrompt('/x', null), null);
});

test('extractMetrics survives a stream with no result event', () => {
  const m = extractMetrics(parseStream('{"type":"system","subtype":"init"}\n'));
  assert.equal(m.costUsd, 0);
  assert.equal(m.turns, 0);
});

test('toRegex honours a leading inline flag group', () => {
  assert.ok(toRegex('(?i)hello').test('HELLO'));
  assert.ok(toRegex('^b$', 'm').test('a\nb\nc'));
  assert.ok(!toRegex('hello').test('HELLO'));
});

test('globToRegex: star stays in a folder, double star crosses, braces alternate', () => {
  assert.ok(globToRegex('specs/*.md').test('specs/a.md'));
  assert.ok(!globToRegex('specs/*.md').test('specs/sub/a.md'));
  assert.ok(globToRegex('specs/**/*.md').test('specs/sub/a.md'));
  assert.ok(globToRegex('specs/**/*.md').test('specs/a.md'));
  assert.ok(globToRegex('{src,docs/plans}/**').test('docs/plans/x.md'));
  assert.ok(!globToRegex('{src,docs/plans}/**').test('specs/x.md'));
  assert.ok(!globToRegex('a.md').test('aXmd'));
});

const ctxFor = (over = {}) => ({
  parsed: parseStream(STREAM), stderr: '',
  before: { 'src/a.js': 'h1' }, after: { 'src/a.js': 'h1' }, readFile: () => '', ...over,
});

test('dispatch and skill assertions', () => {
  const res = evaluateAssertions({
    subagentDispatched: 'sdd-engineering:spec-creator',
    notDispatched: ['sdd-engineering:plan-verifier', 'architecture-review:*'],
    skillInvoked: 'sdd-engineering:run-plan',
    skillNotInvoked: ['sdd-engineering:workflow-retro'],
  }, ctxFor());
  assert.deepEqual(failed(res), []);
  const bad = evaluateAssertions({
    subagentDispatched: 'sdd-engineering:plan-verifier',
    notDispatched: ['sdd-engineering:*'],
    skillNotInvoked: 'sdd-engineering:run-plan',
  }, ctxFor());
  assert.deepEqual(failed(bad), [
    'subagentDispatched:sdd-engineering:plan-verifier',
    'notDispatched:sdd-engineering:*',
    'skillNotInvoked:sdd-engineering:run-plan',
  ]);
});

test('notDispatched "*" fails on any dispatch', () => {
  assert.deepEqual(failed(evaluateAssertions({ notDispatched: ['*'] }, ctxFor())), ['notDispatched:*']);
});

test('file assertions use created/modified detection and globs', () => {
  const files = { 'specs/x.md': '# Spec\nSPEC-2026-10-14-x\nAC-1 The system shall do it.\n```js\ncode\n```\n' };
  const ctx = ctxFor({
    after: { 'src/a.js': 'h1', 'specs/x.md': 'h2' },
    readFile: (f) => files[f] ?? '',
  });
  const ok = evaluateAssertions({
    fileCreatedGlob: 'specs/*.md',
    fileNotCreatedGlob: 'docs/**',
    fileContainsRegex: [{ glob: 'specs/*.md', regex: '\\bAC-1\\b' }, { glob: 'specs/*.md', regex: '(?i)the system SHALL' }],
    fileUnchanged: 'src/a.js',
  }, ctx);
  assert.deepEqual(failed(ok), []);
  const bad = evaluateAssertions({
    fileNotCreatedGlob: 'specs/**',
    fileNotContainsRegex: [{ glob: 'specs/*.md', regex: '(?m)^```(js|ts)\\b' }],
    fileContainsRegex: [{ glob: 'plans/*.md', regex: 'x' }],
    noFilesChanged: true,
  }, ctx);
  assert.equal(failed(bad).length, 4);
});

test('fileUnchanged fails on modification and on deletion; noFilesChanged sees modifications', () => {
  const modified = ctxFor({ after: { 'src/a.js': 'CHANGED' } });
  assert.deepEqual(failed(evaluateAssertions({ fileUnchanged: 'src/a.js', noFilesChanged: true }, modified)), ['fileUnchanged:src/a.js', 'noFilesChanged']);
  const removed = ctxFor({ after: {} });
  assert.deepEqual(failed(evaluateAssertions({ fileUnchanged: 'src/a.js' }, removed)), ['fileUnchanged:src/a.js']);
});

test('fileNotContainsRegex passes vacuously when no file matches the glob', () => {
  assert.deepEqual(failed(evaluateAssertions({ fileNotContainsRegex: [{ glob: 'specs/*.md', regex: 'x' }] }, ctxFor())), []);
});

test('final text and init assertions', () => {
  const ok = evaluateAssertions({
    finalTextRegex: '(?i)questions',
    finalTextNotRegex: 'approved',
    initHasSkills: ['sdd-engineering:workflow-retro'],
    initHasAgents: ['sdd-engineering:implementer'],
    initNoPluginErrors: true,
    stderrNotRegex: '(?i)warn',
  }, ctxFor());
  assert.deepEqual(failed(ok), []);
  const bad = evaluateAssertions({
    initHasSkills: ['sdd-engineering:missing'],
    initHasAgents: ['nope:agent'],
    stderrNotRegex: '(?i)warn',
  }, ctxFor({ stderr: 'WARNING: skill failed to parse' }));
  assert.equal(failed(bad).length, 3);
});

test('initNoPluginErrors fails on plugin_errors', () => {
  const p = parseStream(STREAM);
  p.init.plugin_errors = [{ plugin: 'x', error: 'bad' }];
  assert.deepEqual(failed(evaluateAssertions({ initNoPluginErrors: true }, ctxFor({ parsed: p }))), ['initNoPluginErrors']);
});

test('runCompleted is implicit and fails on error results, unless allowed', () => {
  const p = parseStream(STREAM);
  assert.deepEqual(failed(evaluateAssertions({}, ctxFor({ parsed: p }))), []);
  p.result = { ...p.result, subtype: 'error_max_turns', is_error: true };
  assert.deepEqual(failed(evaluateAssertions({}, ctxFor({ parsed: p }))), ['runCompleted']);
  assert.deepEqual(failed(evaluateAssertions({}, ctxFor({ parsed: p }), { allowIncomplete: true })), []);
  assert.deepEqual(failed(evaluateAssertions({}, ctxFor({ parsed: parseStream('') }))), ['runCompleted']);
});

test('median, summarize and formatTable', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), 0);
  const mk = (id, passed, cost, ms) => ({
    id, run: 1, passed, assertions: passed ? [] : [{ name: 'a', ok: false, detail: '' }],
    metrics: { costUsd: cost, durationMs: ms, inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheCreationTokens: 4, turns: 2, subagentsSpawned: 0 },
  });
  const runs = [mk('a', true, 0.1, 1000), mk('a', false, 0.3, 3000), mk('b', true, 0.2, 2000)];
  const s = summarize(runs);
  assert.equal(s.runs, 3);
  assert.equal(s.passed, 2);
  assert.ok(Math.abs(s.totalCostUsd - 0.6) < 1e-9);
  assert.equal(s.medianCostUsd, 0.2);
  assert.equal(s.medianLatencyMs, 2000);
  assert.deepEqual(s.tokens, { input: 3, output: 6, cacheRead: 9, cacheCreation: 12 });
  assert.equal(s.byCase.a.passed, 1);
  const table = formatTable(runs);
  assert.match(table, /case\s+run\s+result\s+cost/);
  assert.match(table, /FAIL/);
});

test('selectCases by kind, id, and expensive gating', () => {
  const cases = [
    { id: 'n1', kind: 'negative' }, { id: 'b1', kind: 'behavior' }, { id: 'e1', kind: 'behavior', expensive: true },
  ];
  assert.deepEqual(selectCases(cases, 'negative').run.map((c) => c.id), ['n1']);
  assert.deepEqual(selectCases(cases, 'all').run.map((c) => c.id), ['n1', 'b1']);
  assert.deepEqual(selectCases(cases, 'all').skipped, ['e1']);
  assert.deepEqual(selectCases(cases, 'all', { includeExpensive: true }).run.map((c) => c.id), ['n1', 'b1', 'e1']);
  assert.deepEqual(selectCases(cases, 'b1,n1').run.map((c) => c.id), ['n1', 'b1']);
  assert.throws(() => selectCases(cases, 'zzz'), /unknown case id/);
});

test('parseArgs defaults, flags and errors', () => {
  const d = parseArgs([]);
  assert.equal(d.model, 'haiku');
  assert.equal(d.repeat, 1);
  assert.equal(d.maxTotalUsd, 3);
  const o = parseArgs(['--cases', 'negative', '--model', 'sonnet', '--repeat', '3', '--include-expensive', '--out', 'x.json', '--probe']);
  assert.deepEqual([o.cases, o.model, o.repeat, o.includeExpensive, o.out, o.probe], ['negative', 'sonnet', 3, true, 'x.json', true]);
  assert.throws(() => parseArgs(['--bogus']), /unknown argument/);
  assert.throws(() => parseArgs(['--repeat', '0']), /positive integer/);
  assert.throws(() => parseArgs(['--model']), /needs a value/);
});

test('buildClaudeArgs isolates settings and mcp and loads the four plugins relatively to the root', () => {
  const args = buildClaudeArgs({ prompt: 'hi', model: 'haiku', maxTurns: 3, maxBudgetUsd: 0.5, pluginRoot: '/repo' });
  const at = (flag) => args[args.indexOf(flag) + 1];
  assert.equal(at('--setting-sources'), 'project');
  assert.ok(args.includes('--strict-mcp-config'));
  assert.equal(at('--mcp-config'), '{"mcpServers":{}}');
  assert.equal(at('--max-turns'), '3');
  assert.equal(at('--max-budget-usd'), '0.5');
  const dirs = args.flatMap((a, i) => (a === '--plugin-dir' ? [args[i + 1]] : []));
  assert.deepEqual(dirs, [
    '/repo/plugins/engineering-paved-path', '/repo/plugins/research-tools',
    '/repo/plugins/architecture-review', '/repo/plugins/sdd-engineering',
  ]);
});

test('snapshotFiles hashes files and skips .git and node_modules', () => {
  const dir = mkdtempSync(join(tmpdir(), 'snap-'));
  try {
    mkdirSync(join(dir, 'a/b'), { recursive: true });
    mkdirSync(join(dir, '.git'));
    mkdirSync(join(dir, 'node_modules'));
    writeFileSync(join(dir, 'a/b/c.txt'), 'x');
    writeFileSync(join(dir, '.git/HEAD'), 'y');
    writeFileSync(join(dir, 'node_modules/z.js'), 'z');
    const snap = snapshotFiles(dir);
    assert.deepEqual(Object.keys(snap), ['a/b/c.txt']);
    writeFileSync(join(dir, 'a/b/c.txt'), 'changed');
    assert.notEqual(snapshotFiles(dir)['a/b/c.txt'], snap['a/b/c.txt']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('probeVerdict flags user-level leaks, foreign plugins, mcp servers and a loaded global memory', () => {
  const init = {
    skills: ['sdd-engineering:run-plan', 'code-review'], agents: ['general-purpose'], slash_commands: [], mcp_servers: [],
    plugins: ['engineering-paved-path', 'research-tools', 'architecture-review', 'sdd-engineering']
      .map((name) => ({ name, source: `${name}@inline` })).concat([{ name: 'cc-plugin-x', source: 'cc-plugin-x@builtin' }]),
  };
  const clean = probeVerdict({ init, hookEvents: [] }, new Set(['agentic-workflow']), { memoryAnswer: 'NO' });
  assert.deepEqual(failed(clean), []);
  const dirty = probeVerdict(
    { init: { ...init, skills: [...init.skills, 'agentic-workflow'], mcp_servers: [{ name: 'x' }] }, hookEvents: [{ subtype: 'hook_started', command: '~/.claude/hooks/x.sh' }] },
    new Set(['agentic-workflow']), { memoryAnswer: 'YES, Glib' },
  );
  assert.deepEqual(failed(dirty).sort(), ['globalClaudeMdNotLoaded', 'noForeignHooks', 'noMcpServers', 'noUserLevelSkillsAgentsCommands']);
  const bundled = probeVerdict({ init: { ...init, skills: [...init.skills, 'verify'] }, hookEvents: [] }, new Set(['verify']));
  assert.deepEqual(failed(bundled), []);
  assert.deepEqual(failed(probeVerdict({ init: null, hookEvents: [] }, new Set())).includes('initEvent'), true);
});

test('cases.json is well formed and its fixture and assertion keys exist', async () => {
  const root = resolve(here, '../../..');
  const cfg = JSON.parse(readFileSync(join(root, 'plugins/sdd-engineering/evals/cases.json'), 'utf8'));
  const known = new Set([
    'subagentDispatched', 'notDispatched', 'skillInvoked', 'skillNotInvoked', 'fileCreatedGlob', 'fileNotCreatedGlob',
    'fileContainsRegex', 'fileNotContainsRegex', 'fileUnchanged', 'noFilesChanged', 'finalTextRegex', 'finalTextNotRegex',
    'initHasSkills', 'initHasAgents', 'initNoPluginErrors', 'stderrNotRegex',
  ]);
  const ids = new Set();
  for (const c of cfg.cases) {
    assert.ok(!ids.has(c.id), `duplicate id ${c.id}`);
    ids.add(c.id);
    assert.ok(['behavior', 'negative'].includes(c.kind), c.id);
    assert.ok(c.prompt && c.assertions, c.id);
    for (const k of Object.keys(c.assertions)) assert.ok(known.has(k), `${c.id}: unknown assertion ${k}`);
    for (const k of ['fileContainsRegex', 'fileNotContainsRegex']) {
      for (const { regex } of c.assertions[k] ?? []) assert.doesNotThrow(() => toRegex(regex, 'm'), `${c.id}: ${regex}`);
    }
    for (const g of [c.assertions.fileCreatedGlob, c.assertions.fileNotCreatedGlob].flat().filter(Boolean)) assert.doesNotThrow(() => globToRegex(g));
  }
  assert.ok(cfg.cases.some((c) => c.expensive));
  assert.ok(readFileSync(join(root, 'plugins/sdd-engineering/evals', cfg.fixture, 'CLAUDE.md'), 'utf8').includes('npm test'));
});

test('evalEnv passes auth, locale and proxy variables and drops every other inherited one', () => {
  const env = evalEnv({
    PATH: '/bin', HOME: '/h', TMPDIR: '/t', LANG: 'en_US.UTF-8', LC_ALL: 'C', TERM: 'xterm',
    ANTHROPIC_API_KEY: 'k', CLAUDE_CODE_OAUTH_TOKEN: 'o', HTTPS_PROXY: 'p', NODE_EXTRA_CA_CERTS: 'ca',
    GITHUB_TOKEN: 'secret', AWS_SECRET_ACCESS_KEY: 'secret', NPM_TOKEN: 'secret', OPENAI_API_KEY: 'secret',
  }, 'haiku');
  for (const k of ['GITHUB_TOKEN', 'AWS_SECRET_ACCESS_KEY', 'NPM_TOKEN', 'OPENAI_API_KEY']) assert.ok(!(k in env), `${k} leaked`);
  assert.deepEqual(
    [env.PATH, env.HOME, env.TMPDIR, env.LANG, env.LC_ALL, env.TERM, env.ANTHROPIC_API_KEY, env.CLAUDE_CODE_OAUTH_TOKEN, env.HTTPS_PROXY, env.NODE_EXTRA_CA_CERTS],
    ['/bin', '/h', '/t', 'en_US.UTF-8', 'C', 'xterm', 'k', 'o', 'p', 'ca'],
  );
  assert.equal(env.CLAUDE_CODE_DISABLE_AUTO_MEMORY, '1');
  assert.equal(env.CLAUDE_CODE_SUBAGENT_MODEL, 'haiku');
  assert.equal(env.CLAUDE_CODE_SUBAGENT_MODEL_FORCE, '1');
});

test('evalEnv keeps the secret name the evals workflow passes', () => {
  const wf = readFileSync(resolve(here, '../../../.github/workflows/evals.yml'), 'utf8');
  const names = [...wf.matchAll(/^\s+([A-Z][A-Z0-9_]*):\s*\$\{\{\s*secrets\./gm)].map((m) => m[1]);
  assert.ok(names.length > 0, 'no secrets in evals.yml');
  const env = evalEnv(Object.fromEntries(names.map((n) => [n, 'x'])), 'haiku');
  for (const n of names) assert.equal(env[n], 'x', `${n} from evals.yml is dropped`);
});

test('buildClaudeArgs uses acceptEdits with an allowlist, not bypassPermissions', () => {
  const args = buildClaudeArgs({ prompt: 'hi', model: 'haiku', maxTurns: 3, pluginRoot: '/repo' });
  assert.ok(!args.includes('bypassPermissions'));
  assert.equal(args[args.indexOf('--permission-mode') + 1], 'acceptEdits');
  const allowed = args[args.indexOf('--allowedTools') + 1].split(',');
  assert.ok(allowed.includes('Agent') && allowed.includes('Bash(npm test:*)'));
  assert.ok(allowed.includes('Bash(bash /repo/plugins/engineering-paved-path/skills/review-bundle/scripts/review-bundle.sh:*)'));
  assert.ok(!allowed.includes('Bash(bash:*)'), 'any bash script is allowed');
  assert.ok(!allowed.some((t) => /^(Bash|WebFetch|WebSearch)$/.test(t)), 'a bare Bash or web tool is allowed');
});

test('snapshotFiles records a symlink by its target without following it, and skips non-regular files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'snap-'));
  const outside = mkdtempSync(join(tmpdir(), 'snap-out-'));
  try {
    writeFileSync(join(outside, 'secret.txt'), 'outside');
    symlinkSync(join(outside, 'secret.txt'), join(dir, 'link-file'));
    symlinkSync(outside, join(dir, 'link-dir'));
    const snap = snapshotFiles(dir);
    assert.deepEqual(Object.keys(snap).sort(), ['link-dir', 'link-file']);
    writeFileSync(join(outside, 'secret.txt'), 'changed outside');
    assert.equal(snapshotFiles(dir)['link-file'], snap['link-file'], 'the link target content was read');
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
