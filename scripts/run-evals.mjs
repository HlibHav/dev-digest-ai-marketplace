#!/usr/bin/env node
/**
 * Eval runner for the sdd-engineering workflow (dependency-free, Node >= 22).
 *
 * Each selected case runs `claude -p` against a fresh copy of the fixture project in a
 * throwaway git repo under os.tmpdir() (never inside a `.claude` directory), with the four
 * plugins of this checkout loaded through --plugin-dir. The stream-json output is parsed for
 * subagent dispatches (Task/Agent tool_use), Skill invocations and the final `result` event
 * (cost, tokens, turns, latency), then the case's deterministic assertions are evaluated
 * against the stream and the temp project's files.
 *
 * This runner is also the cost-baseline tool: the JSON report carries cost, token and latency
 * figures per run and a summary suitable for docs/COST-BASELINE.md.
 *
 * ISOLATION (what keeps a run independent of the machine it runs on)
 *   --setting-sources project     user (~/.claude/settings.json: hooks, enabledPlugins, env,
 *                                 permissions) and local settings are not read.
 *   cwd = temp dir with no parent CLAUDE.md of its own (the fixture's CLAUDE.md is the only
 *                                 project memory); ~/.claude/CLAUDE.md and ~/.claude/rules are
 *                                 user memory and are excluded by the flag above (verified by
 *                                 `--probe`, which asks the model about them).
 *   --strict-mcp-config + empty --mcp-config   no MCP servers from any source.
 *   --plugin-dir x4               the only plugins; ~/.claude/skills, ~/.claude/agents and
 *                                 user-installed plugins do not appear in the init event.
 *   CLAUDE_CODE_DISABLE_AUTO_MEMORY=1   no auto-memory carried between runs.
 *   CLAUDE_CODE_SUBAGENT_MODEL=<model> + _FORCE=1  subagents whose frontmatter says `model: opus`
 *                                 run on the model under test, which keeps the cost cap real
 *                                 (without _FORCE the frontmatter model wins; seen in modelCostsUsd).
 *   --permission-mode acceptEdits + --allowedTools allowedTools()   headless runs cannot answer
 *                                 prompts, so anything outside the allowlist is denied, not asked:
 *                                 edits inside the temp repo, file reads and search, Agent/Skill,
 *                                 `npm test`/`node --test`, run-plan's git and review-bundle.sh.
 *                                 No web tools, no other shell. Denials land in each run record.
 *   env = evalEnv()               an allowlist of the parent environment: PATH, HOME, locale, temp,
 *                                 proxy and CA variables, and the Claude auth variables. Every other
 *                                 inherited variable (GITHUB_TOKEN, cloud keys, ...) is dropped.
 * Not isolated: the login (OAuth keychain or ANTHROPIC_API_KEY) and the built-in bundled
 * skills of the CLI version. `--probe` reports both honestly.
 *
 * Usage
 *   node scripts/run-evals.mjs [--cases id1,id2|negative|behavior|all] [--model haiku]
 *        [--repeat N] [--include-expensive] [--out file] [--max-total-usd 3]
 *        [--keep]   keep each temp project and write the raw stream to .tmp/evals/<id>-<run>.stream.jsonl
 *   node scripts/run-evals.mjs --probe [--model haiku]
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EVALS_DIR = join(REPO_ROOT, 'plugins/sdd-engineering/evals');
const PLUGINS = ['engineering-paved-path', 'research-tools', 'architecture-review', 'sdd-engineering'];
const SUBAGENT_TOOL_NAMES = new Set(['Task', 'Agent']);

// ---------------------------------------------------------------------------------------------
// Stream parsing
// ---------------------------------------------------------------------------------------------

/** Parse the stdout of `claude -p --output-format stream-json --verbose` (one JSON per line). */
export function parseStream(text) {
  const out = {
    init: null, events: 0, badLines: 0, toolUses: [], dispatched: [], skills: [], toolsUsed: [],
    assistantText: [], finalText: '', result: null, hookEvents: [],
  };
  for (const line of String(text).split('\n')) {
    if (!line.trim()) continue;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      out.badLines += 1;
      continue;
    }
    out.events += 1;
    if (e.type === 'system' && e.subtype === 'init') out.init = e;
    else if (e.type === 'system' && typeof e.subtype === 'string' && e.subtype.startsWith('hook')) out.hookEvents.push(e);
    else if (e.type === 'assistant' && Array.isArray(e.message?.content)) {
      for (const block of e.message.content) {
        if (block.type === 'text' && !e.parent_tool_use_id) out.assistantText.push(block.text);
        if (block.type !== 'tool_use') continue;
        const input = block.input ?? {};
        out.toolUses.push({ name: block.name, input, nested: Boolean(e.parent_tool_use_id) });
        out.toolsUsed.push(block.name);
        if (SUBAGENT_TOOL_NAMES.has(block.name) && typeof input.subagent_type === 'string') out.dispatched.push(input.subagent_type);
        if (block.name === 'Skill' && typeof input.skill === 'string') out.skills.push(input.skill.replace(/^\//, ''));
      }
    } else if (e.type === 'user' && !e.parent_tool_use_id) {
      // A slash command typed as the prompt is expanded by the harness, not by a Skill tool call.
      const content = e.message?.content;
      const blob = typeof content === 'string' ? content : JSON.stringify(content ?? '');
      for (const m of blob.matchAll(/<command-name>\/?([^<\s]+)<\/command-name>/g)) out.skills.push(m[1]);
    } else if (e.type === 'result') out.result = e;
  }
  out.finalText = typeof out.result?.result === 'string' ? out.result.result : out.assistantText.at(-1) ?? '';
  return out;
}

/**
 * A prompt that starts with `/plugin:skill` is expanded by the CLI itself, so the stream has no
 * Skill tool_use for it. Returns the skill name when the init event lists it as a slash command.
 */
export function slashSkillFromPrompt(prompt, init) {
  const m = /^\/([\w:.-]+)/.exec(String(prompt).trim());
  return m && init?.slash_commands?.includes(m[1]) ? m[1] : null;
}

/** Cost, tokens and latency of one run, from the `result` event. */
export function extractMetrics(parsed) {
  const r = parsed.result;
  const u = r?.usage ?? {};
  return {
    costUsd: r?.total_cost_usd ?? 0,
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
    turns: r?.num_turns ?? 0,
    durationMs: r?.duration_ms ?? 0,
    durationApiMs: r?.duration_api_ms ?? 0,
    models: Object.keys(r?.modelUsage ?? {}),
    modelCostsUsd: Object.fromEntries(Object.entries(r?.modelUsage ?? {}).map(([m, v]) => [m, v.costUSD ?? 0])),
    subagentsSpawned: r?.subagent_stats?.spawned ?? parsed.dispatched.length,
  };
}

// ---------------------------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------------------------

const asList = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);

/** Accept JS regex source plus an optional leading inline flag group such as `(?i)` or `(?im)`. */
export function toRegex(source, extraFlags = '') {
  let src = source;
  let flags = extraFlags;
  const m = /^\(\?([imsu]+)\)/.exec(src);
  if (m) {
    src = src.slice(m[0].length);
    flags += m[1];
  }
  return new RegExp(src, [...new Set(flags)].join(''));
}

/** Glob to RegExp: `**` crosses folders, `*` and `?` do not, `{a,b}` is alternation. */
export function globToRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i += 1;
        if (glob[i + 1] === '/') {
          i += 1;
          re += '(?:.*/)?';
        } else re += '.*';
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '{') re += '(?:';
    else if (c === '}') re += ')';
    else if (c === ',' && /\{[^}]*$/.test(glob.slice(0, i))) re += '|';
    else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

const wildcardMatch = (pattern, value) => pattern === '*' || (pattern.endsWith('*') ? value.startsWith(pattern.slice(0, -1)) : pattern === value);

const SKIP_DIRS = new Set(['.git', 'node_modules']);

/**
 * relative path -> sha1 for every file under dir (skips .git and node_modules). A symlink is
 * hashed by its target path and never followed, so a run cannot make the snapshot read outside
 * the temp repo; sockets, FIFOs and devices are skipped (reading a FIFO would block).
 */
export function snapshotFiles(dir) {
  const files = {};
  const hash = (data) => createHash('sha1').update(data).digest('hex');
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      if (SKIP_DIRS.has(name)) continue;
      const p = join(d, name);
      const rel = relative(dir, p).split(sep).join('/');
      const st = lstatSync(p);
      if (st.isSymbolicLink()) files[rel] = hash(`symlink:${readlinkSync(p)}`);
      else if (st.isDirectory()) walk(p);
      else if (st.isFile()) files[rel] = hash(readFileSync(p));
    }
  };
  if (existsSync(dir)) walk(dir);
  return files;
}

/**
 * Evaluate one case's assertions. ctx = { parsed, stderr, before, after, readFile }.
 *   before/after: snapshotFiles() maps taken after setup and after the run.
 *   readFile(relPath): file text from the final temp dir.
 * Returns [{ name, ok, detail }]. Assertion `runCompleted` is implicit unless allowIncomplete.
 */
export function evaluateAssertions(assertions, ctx, opts = {}) {
  const { parsed, stderr = '', before = {}, after = {}, readFile = () => '' } = ctx;
  const results = [];
  const add = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail: ok ? '' : detail });
  const created = Object.keys(after).filter((p) => !(p in before));
  const modified = Object.keys(after).filter((p) => p in before && before[p] !== after[p]);
  const removed = Object.keys(before).filter((p) => !(p in after));
  const matching = (glob, paths = Object.keys(after)) => paths.filter((p) => globToRegex(glob).test(p));
  const dispatched = parsed.dispatched;
  const skills = parsed.skills;

  if (!opts.allowIncomplete) {
    const r = parsed.result;
    add('runCompleted', r && !r.is_error && r.subtype === 'success', `result: ${r ? `${r.subtype}${r.is_error ? ' (is_error)' : ''}` : 'missing'}`);
  }

  for (const t of asList(assertions.subagentDispatched)) {
    add(`subagentDispatched:${t}`, dispatched.includes(t), `dispatched: [${dispatched.join(', ') || 'none'}]`);
  }
  for (const t of asList(assertions.notDispatched)) {
    const hit = dispatched.filter((d) => wildcardMatch(t, d));
    add(`notDispatched:${t}`, hit.length === 0, `dispatched: [${hit.join(', ')}]`);
  }
  for (const s of asList(assertions.skillInvoked)) add(`skillInvoked:${s}`, skills.includes(s), `skills: [${skills.join(', ') || 'none'}]`);
  for (const s of asList(assertions.skillNotInvoked)) add(`skillNotInvoked:${s}`, !skills.includes(s), `skills: [${skills.join(', ')}]`);

  for (const g of asList(assertions.fileCreatedGlob)) {
    add(`fileCreatedGlob:${g}`, matching(g, created).length > 0, `created: [${created.join(', ') || 'none'}]`);
  }
  for (const g of asList(assertions.fileNotCreatedGlob)) {
    const hit = matching(g, created);
    add(`fileNotCreatedGlob:${g}`, hit.length === 0, `created: [${hit.join(', ')}]`);
  }
  for (const { glob, regex } of asList(assertions.fileContainsRegex)) {
    const files = matching(glob);
    const ok = files.some((f) => toRegex(regex, 'm').test(readFile(f)));
    add(`fileContainsRegex:${glob} ~ ${regex}`, ok, files.length ? `no match in [${files.join(', ')}]` : 'no file matches the glob');
  }
  for (const { glob, regex } of asList(assertions.fileNotContainsRegex)) {
    const bad = matching(glob).filter((f) => toRegex(regex, 'm').test(readFile(f)));
    add(`fileNotContainsRegex:${glob} !~ ${regex}`, bad.length === 0, `matched in [${bad.join(', ')}]`);
  }
  for (const f of asList(assertions.fileUnchanged)) {
    add(`fileUnchanged:${f}`, f in after && before[f] === after[f], f in after ? 'file was modified' : 'file is missing');
  }
  if (assertions.noFilesChanged) {
    add('noFilesChanged', !created.length && !modified.length && !removed.length,
      `created [${created.join(', ')}] modified [${modified.join(', ')}] removed [${removed.join(', ')}]`);
  }
  for (const re of asList(assertions.finalTextRegex)) add(`finalTextRegex:${re}`, toRegex(re).test(parsed.finalText), `final text: ${parsed.finalText.slice(0, 160)}`);
  for (const re of asList(assertions.finalTextNotRegex)) add(`finalTextNotRegex:${re}`, !toRegex(re).test(parsed.finalText), `final text: ${parsed.finalText.slice(0, 160)}`);

  const init = parsed.init;
  for (const s of asList(assertions.initHasSkills)) add(`initHasSkills:${s}`, init?.skills?.includes(s), `init skills: ${init ? init.skills.length : 'no init event'}`);
  for (const a of asList(assertions.initHasAgents)) add(`initHasAgents:${a}`, init?.agents?.includes(a), `init agents: ${init ? init.agents.join(', ') : 'no init event'}`);
  if (assertions.initNoPluginErrors) {
    const errs = init?.plugin_errors ?? [];
    add('initNoPluginErrors', Boolean(init) && errs.length === 0, init ? `plugin_errors: ${JSON.stringify(errs)}` : 'no init event');
  }
  if (assertions.stderrNotRegex) add(`stderrNotRegex:${assertions.stderrNotRegex}`, !toRegex(assertions.stderrNotRegex).test(stderr), `stderr: ${stderr.slice(0, 200)}`);
  return results;
}

// ---------------------------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------------------------

export function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Summary over run records: { id, passed, metrics }. */
export function summarize(runs) {
  const sum = (k) => runs.reduce((a, r) => a + (r.metrics?.[k] ?? 0), 0);
  const byCase = {};
  for (const r of runs) {
    const c = (byCase[r.id] ??= { runs: 0, passed: 0, costs: [], latencies: [] });
    c.runs += 1;
    if (r.passed) c.passed += 1;
    c.costs.push(r.metrics?.costUsd ?? 0);
    c.latencies.push(r.metrics?.durationMs ?? 0);
  }
  return {
    runs: runs.length,
    passed: runs.filter((r) => r.passed).length,
    passRate: runs.length ? runs.filter((r) => r.passed).length / runs.length : 0,
    totalCostUsd: sum('costUsd'),
    medianCostUsd: median(runs.map((r) => r.metrics?.costUsd ?? 0)),
    medianLatencyMs: median(runs.map((r) => r.metrics?.durationMs ?? 0)),
    tokens: {
      input: sum('inputTokens'), output: sum('outputTokens'),
      cacheRead: sum('cacheReadTokens'), cacheCreation: sum('cacheCreationTokens'),
    },
    byCase: Object.fromEntries(Object.entries(byCase).map(([id, c]) => [id, {
      runs: c.runs, passed: c.passed, medianCostUsd: median(c.costs), medianLatencyMs: median(c.latencies),
    }])),
  };
}

const usd = (n) => `$${n.toFixed(4)}`;
const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;

export function formatTable(runs) {
  const rows = [['case', 'run', 'result', 'cost', 'latency', 'turns', 'agents', 'failed assertions']];
  for (const r of runs) {
    rows.push([
      r.id, String(r.run), r.passed ? 'PASS' : 'FAIL', usd(r.metrics.costUsd), secs(r.metrics.durationMs),
      String(r.metrics.turns), String(r.metrics.subagentsSpawned), r.assertions.filter((a) => !a.ok).map((a) => a.name).join('; ') || '-',
    ]);
  }
  const widths = rows[0].map((_, i) => Math.min(60, Math.max(...rows.map((row) => row[i].length))));
  return rows.map((row) => row.map((cell, i) => (cell.length > widths[i] ? `${cell.slice(0, widths[i] - 1)}…` : cell.padEnd(widths[i]))).join('  ').trimEnd()).join('\n');
}

// ---------------------------------------------------------------------------------------------
// Case selection and CLI
// ---------------------------------------------------------------------------------------------

export function selectCases(allCases, spec, { includeExpensive = false } = {}) {
  const wanted = (spec ?? 'all').split(',').map((s) => s.trim()).filter(Boolean);
  const picked = allCases.filter((c) => wanted.includes('all') || wanted.includes(c.kind) || wanted.includes(c.id));
  const unknown = wanted.filter((w) => !['all', 'negative', 'behavior'].includes(w) && !allCases.some((c) => c.id === w));
  if (unknown.length) throw new Error(`unknown case id(s): ${unknown.join(', ')}`);
  const skipped = picked.filter((c) => c.expensive && !includeExpensive).map((c) => c.id);
  return { run: picked.filter((c) => !(c.expensive && !includeExpensive)), skipped };
}

export function parseArgs(argv) {
  const o = { cases: 'all', model: 'haiku', repeat: 1, includeExpensive: false, out: null, maxTotalUsd: 3, keep: false, probe: false };
  const need = (i, name) => {
    if (i + 1 >= argv.length) throw new Error(`${name} needs a value`);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--cases') o.cases = need(i++, a);
    else if (a === '--model') o.model = need(i++, a);
    else if (a === '--repeat') o.repeat = Number.parseInt(need(i++, a), 10);
    else if (a === '--out') o.out = need(i++, a);
    else if (a === '--max-total-usd') o.maxTotalUsd = Number(need(i++, a));
    else if (a === '--include-expensive') o.includeExpensive = true;
    else if (a === '--keep') o.keep = true;
    else if (a === '--probe') o.probe = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!Number.isInteger(o.repeat) || o.repeat < 1) throw new Error('--repeat must be a positive integer');
  if (!Number.isFinite(o.maxTotalUsd) || o.maxTotalUsd <= 0) throw new Error('--max-total-usd must be a positive number');
  return o;
}

// ---------------------------------------------------------------------------------------------
// Running claude
// ---------------------------------------------------------------------------------------------

function sh(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed: ${r.stderr || r.stdout}`);
}

/** Fresh temp project: fixture copy + setup files, committed in a new git repo. */
export function prepareProject(fixtureDir, setupFiles = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'sdd-eval-'));
  if (dir.split(sep).includes('.claude')) throw new Error(`temp dir inside .claude: ${dir}`);
  cpSync(fixtureDir, dir, { recursive: true });
  for (const [rel, content] of Object.entries(setupFiles)) {
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
  sh('git', ['init', '-q', '-b', 'main'], dir);
  sh('git', ['add', '-A'], dir);
  sh('git', ['-c', 'user.name=eval', '-c', 'user.email=eval@example.invalid', 'commit', '-q', '-m', 'fixture'], dir);
  return dir;
}

/**
 * What a headless run may do without a prompt; everything else is denied. Bash is limited to the
 * fixture's test command, the git that run-plan needs (read, branch, add, commit) and the
 * review-bundle script of the loaded paved-path plugin.
 */
export function allowedTools(pluginRoot = REPO_ROOT) {
  const bundle = join(pluginRoot, 'plugins/engineering-paved-path/skills/review-bundle/scripts/review-bundle.sh');
  return [
    'Read', 'Glob', 'Grep', 'Write', 'Edit', 'MultiEdit', 'TodoWrite', 'Agent', 'Task', 'Skill',
    'Bash(npm test:*)', 'Bash(node --test:*)', `Bash(bash ${bundle}:*)`,
    ...['diff', 'log', 'show', 'status', 'rev-parse', 'merge-base', 'ls-files', 'blame', 'grep',
      'checkout -b', 'switch -c', 'branch', 'add', 'commit'].map((c) => `Bash(git ${c}:*)`),
  ];
}

const ENV_KEEP = new Set([
  'PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'TERM',
  'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CONFIG_DIR',
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy', 'NODE_EXTRA_CA_CERTS',
]);

/** The child environment: an allowlist of `parent` plus the runner's own isolation variables. */
export function evalEnv(parent, model) {
  const env = {};
  for (const [k, v] of Object.entries(parent)) if (ENV_KEEP.has(k) || k.startsWith('LC_')) env[k] = v;
  return { ...env, CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1', CLAUDE_CODE_SUBAGENT_MODEL: model, CLAUDE_CODE_SUBAGENT_MODEL_FORCE: '1' };
}

export function buildClaudeArgs({ prompt, model, maxTurns, maxBudgetUsd, pluginRoot = REPO_ROOT }) {
  const args = [
    '-p', prompt, '--output-format', 'stream-json', '--verbose', '--model', model,
    '--max-turns', String(maxTurns), '--setting-sources', 'project',
    '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
    '--permission-mode', 'acceptEdits', '--allowedTools', allowedTools(pluginRoot).join(','),
  ];
  if (maxBudgetUsd) args.push('--max-budget-usd', String(maxBudgetUsd));
  for (const p of PLUGINS) args.push('--plugin-dir', join(pluginRoot, 'plugins', p));
  return args;
}

function runClaude(args, cwd, model, timeoutMs = 15 * 60 * 1000) {
  return new Promise((resolveRun) => {
    const started = Date.now();
    const child = spawn('claude', args, {
      cwd,
      env: evalEnv(process.env, model),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolveRun({ stdout, stderr, code, signal, wallMs: Date.now() - started });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolveRun({ stdout, stderr: `${stderr}${err.message}`, code: -1, signal: null, wallMs: Date.now() - started });
    });
  });
}

async function runCase(c, defaults, fixtureDir, opts, runIndex) {
  const dir = prepareProject(fixtureDir, c.setup?.files ?? {});
  try {
    return await runCaseIn(dir, c, defaults, opts, runIndex);
  } finally {
    if (!opts.keep) rmSync(dir, { recursive: true, force: true });
  }
}

async function runCaseIn(dir, c, defaults, opts, runIndex) {
  const before = snapshotFiles(dir);
  const args = buildClaudeArgs({
    prompt: c.prompt, model: opts.model, maxTurns: c.maxTurns ?? defaults.maxTurns, maxBudgetUsd: c.maxBudgetUsd ?? defaults.maxBudgetUsd,
  });
  const res = await runClaude(args, dir, opts.model);
  const parsed = parseStream(res.stdout);
  const slash = slashSkillFromPrompt(c.prompt, parsed.init);
  if (slash && !parsed.skills.includes(slash)) parsed.skills.unshift(slash);
  if (opts.keep) {
    const streamFile = join(REPO_ROOT, '.tmp/evals', `${c.id}-${runIndex}.stream.jsonl`);
    mkdirSync(dirname(streamFile), { recursive: true });
    writeFileSync(streamFile, res.stdout);
  }
  const after = snapshotFiles(dir);
  const assertions = evaluateAssertions(c.assertions ?? {}, {
    parsed, stderr: res.stderr, before, after, readFile: (f) => readFileSync(join(dir, f), 'utf8'),
  }, { allowIncomplete: c.allowIncomplete });
  const metrics = extractMetrics(parsed);
  if (!parsed.result) assertions.unshift({ name: 'resultEvent', ok: false, detail: `exit ${res.code} signal ${res.signal}; stderr: ${res.stderr.slice(0, 300)}` });
  const record = {
    id: c.id, kind: c.kind, run: runIndex, passed: assertions.every((a) => a.ok), assertions, metrics,
    wallMs: res.wallMs, exitCode: res.code, dispatched: parsed.dispatched, skills: parsed.skills,
    finalText: parsed.finalText.slice(0, 600), projectDir: opts.keep ? dir : undefined,
    permissionDenials: (parsed.result?.permission_denials ?? []).map((d) => ({ tool: d.tool_name, input: d.tool_input })),
  };
  return record;
}

// ---------------------------------------------------------------------------------------------
// Probe: does a run see anything from the user's own ~/.claude?
// ---------------------------------------------------------------------------------------------

/** Names of user-level skills/commands/agents that must never show up in an isolated run. */
function userLevelNames() {
  const names = new Set();
  for (const sub of ['skills', 'commands', 'agents']) {
    const d = join(homedir(), '.claude', sub);
    if (!existsSync(d)) continue;
    for (const n of readdirSync(d)) names.add(n.replace(/\.md$/, ''));
  }
  return names;
}

/** Names the CLI itself bundles; a user-level skill with the same name cannot be told apart by name. */
const BUNDLED_NAMES = new Set(['verify']);

export function probeVerdict(parsed, userNames, answers = {}) {
  const init = parsed.init;
  const checks = [];
  const add = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail: ok ? '' : detail });
  add('initEvent', Boolean(init), 'no init event');
  const listed = [...(init?.skills ?? []), ...(init?.agents ?? []), ...(init?.slash_commands ?? [])];
  const leaked = listed.filter((n) => userNames.has(n) && !BUNDLED_NAMES.has(n));
  add('noUserLevelSkillsAgentsCommands', leaked.length === 0, `leaked: ${leaked.join(', ')}`);
  const plugins = (init?.plugins ?? []).filter((p) => !String(p.source).endsWith('@builtin')).map((p) => p.name);
  add('onlyOurFourPluginsLoaded', plugins.length === PLUGINS.length && PLUGINS.every((p) => plugins.includes(p)), `plugins: ${plugins.join(', ')}`);
  add('noMcpServers', (init?.mcp_servers ?? []).length === 0, `mcp_servers: ${JSON.stringify(init?.mcp_servers)}`);
  const nonPluginHooks = parsed.hookEvents.filter((h) => !/CLAUDE_PLUGIN_ROOT|agent-guard/.test(JSON.stringify(h)));
  add('noForeignHooks', nonPluginHooks.length === 0, `hook events: ${nonPluginHooks.length}`);
  if ('memoryAnswer' in answers) add('globalClaudeMdNotLoaded', /^\s*NO\b/i.test(answers.memoryAnswer), `model answered: ${answers.memoryAnswer.slice(0, 120)}`);
  return checks;
}

async function probe(opts) {
  const dir = prepareProject(join(EVALS_DIR, 'fixtures/tiny-app'));
  const prompt = "Answer with one line starting with YES or NO. Does your context contain any of these exact words: 'Berlin', 'Ukrainian', 'anti-ai-writing-style', 'Senior PM'? Do not use any tool.";
  const args = buildClaudeArgs({ prompt, model: opts.model, maxTurns: 2, maxBudgetUsd: 0.2 });
  let res;
  try {
    res = await runClaude(args, dir, opts.model);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const parsed = parseStream(res.stdout);
  const checks = probeVerdict(parsed, userLevelNames(), { memoryAnswer: parsed.finalText });
  const lines = checks.map((c) => `${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok ? '' : `  (${c.detail})`}`);
  console.log(`Isolation probe (model ${opts.model}, cost ${usd(extractMetrics(parsed).costUsd)}):\n${lines.join('\n')}`);
  console.log(`Bundled CLI skills still listed (not user-level): ${(parsed.init?.skills ?? []).filter((s) => !s.includes(':')).join(', ')}`);
  return checks.every((c) => c.ok) ? 0 : 1;
}

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.probe) return probe(opts);
  const config = JSON.parse(readFileSync(join(EVALS_DIR, 'cases.json'), 'utf8'));
  const fixtureDir = join(EVALS_DIR, config.fixture);
  const { run: selected, skipped } = selectCases(config.cases, opts.cases, { includeExpensive: opts.includeExpensive });
  if (skipped.length) console.log(`Skipping expensive cases (use --include-expensive): ${skipped.join(', ')}`);
  if (!selected.length) throw new Error('no cases selected');

  const runs = [];
  let spent = 0;
  let capHit = false;
  for (let n = 1; n <= opts.repeat && !capHit; n += 1) {
    for (const c of selected) {
      if (spent >= opts.maxTotalUsd) {
        capHit = true;
        console.log(`Total spend ${usd(spent)} reached the cap ${usd(opts.maxTotalUsd)}; stopping before ${c.id}.`);
        break;
      }
      process.stdout.write(`running ${c.id} (run ${n}) ... `);
      const rec = await runCase(c, config.defaults ?? {}, fixtureDir, opts, n);
      spent += rec.metrics.costUsd;
      runs.push(rec);
      console.log(`${rec.passed ? 'PASS' : 'FAIL'} ${usd(rec.metrics.costUsd)} ${secs(rec.metrics.durationMs)}`);
    }
  }

  const summary = summarize(runs);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outFile = resolve(opts.out ?? join(REPO_ROOT, '.tmp/evals', `${stamp}.json`));
  mkdirSync(dirname(outFile), { recursive: true });
  const cli = spawnSync('claude', ['--version'], { encoding: 'utf8' }).stdout?.trim();
  writeFileSync(outFile, `${JSON.stringify({
    generatedAt: new Date().toISOString(), cliVersion: cli, model: opts.model, subagentModel: opts.model,
    options: { cases: opts.cases, repeat: opts.repeat, includeExpensive: opts.includeExpensive, maxTotalUsd: opts.maxTotalUsd },
    skipped, summary, runs,
  }, null, 2)}\n`);

  console.log(`\n${formatTable(runs)}`);
  for (const r of runs.filter((x) => !x.passed)) {
    console.log(`\n${r.id} (run ${r.run}) failures:`);
    for (const a of r.assertions.filter((x) => !x.ok)) console.log(`  - ${a.name}: ${a.detail}`);
  }
  console.log(`\npass rate ${summary.passed}/${summary.runs}  median cost ${usd(summary.medianCostUsd)}  median latency ${secs(summary.medianLatencyMs)}  total cost ${usd(summary.totalCostUsd)}`);
  console.log(`tokens: input ${summary.tokens.input}  output ${summary.tokens.output}  cache read ${summary.tokens.cacheRead}  cache creation ${summary.tokens.cacheCreation}`);
  console.log(`report: ${outFile}`);
  return summary.passed === summary.runs ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => process.exit(code), (err) => {
    console.error(err.message);
    process.exit(2);
  });
}
