// Shared contract between the build (scripts/) and the browser (site-src/).
// Isomorphic: no node:* imports, no DOM access.

export const TYPES = Object.freeze(['plugin', 'skill', 'agent', 'command', 'hook', 'mcp_server']);
export const SCHEMA_VERSION = 1;
export const MARKETPLACE = 'dev-digest-ai-marketplace';
export const REPO = 'HlibHav/dev-digest-ai-marketplace';
export const MAX_EXCERPT = 4000;
export const MAX_QUERY = 200;

const fail = (path, rule) => {
  throw new Error(`index${path ? `.${path}` : ''}: ${rule}`);
};
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const needObj = (v, path) => { if (!isObj(v)) fail(path, 'must be an object'); };
const needArr = (v, path) => { if (!Array.isArray(v)) fail(path, 'must be an array'); };
const needStr = (v, path) => { if (typeof v !== 'string') fail(path, 'must be a string'); };
const needBool = (v, path) => { if (typeof v !== 'boolean') fail(path, 'must be a boolean'); };
const needInt = (v, path) => { if (!Number.isInteger(v) || v < 0) fail(path, 'must be a non-negative integer'); };
const needStrArr = (v, path) => {
  needArr(v, path);
  v.forEach((s, i) => needStr(s, `${path}[${i}]`));
};

function assertTrust(t, p) {
  needObj(t, p);
  needArr(t.hooks, `${p}.hooks`);
  t.hooks.forEach((h, i) => {
    const hp = `${p}.hooks[${i}]`;
    needObj(h, hp);
    needStr(h.event, `${hp}.event`);
    if (h.matcher !== null) needStr(h.matcher, `${hp}.matcher`);
    needBool(h.broad, `${hp}.broad`);
    needStr(h.source_path, `${hp}.source_path`);
  });
  needArr(t.mcp_servers, `${p}.mcp_servers`);
  t.mcp_servers.forEach((s, i) => {
    const sp = `${p}.mcp_servers[${i}]`;
    needObj(s, sp);
    needStr(s.name, `${sp}.name`);
    if (s.transport !== 'command' && s.transport !== 'url') fail(`${sp}.transport`, 'must be "command" or "url"');
    if (s.transport === 'command') needStr(s.command, `${sp}.command`);
    else needStr(s.url, `${sp}.url`);
    needStrArr(s.args, `${sp}.args`);
    needBool(s.non_loopback, `${sp}.non_loopback`);
    needStr(s.source_path, `${sp}.source_path`);
  });
  needBool(t.has_scripts, `${p}.has_scripts`);
  needStrArr(t.network_urls, `${p}.network_urls`);
}

function assertCost(c, p) {
  needObj(c, p);
  needInt(c.always_loaded_tokens, `${p}.always_loaded_tokens`);
  needInt(c.on_invocation_tokens, `${p}.on_invocation_tokens`);
  needStr(c.method, `${p}.method`);
  needStrArr(c.excluded, `${p}.excluded`);
}

/** Throws an Error naming the path and the rule when `index` breaks the contract. */
export function assertIndexShape(index) {
  needObj(index, '');
  if (index.schema_version !== SCHEMA_VERSION) fail('schema_version', `must be ${SCHEMA_VERSION}`);
  needStr(index.marketplace, 'marketplace');
  needArr(index.plugins, 'plugins');
  needArr(index.artifacts, 'artifacts');

  index.plugins.forEach((pl, i) => {
    const p = `plugins[${i}]`;
    needObj(pl, p);
    for (const k of ['name', 'version', 'description', 'category']) needStr(pl[k], `${p}.${k}`);
    needStrArr(pl.tags, `${p}.tags`);
    needArr(pl.dependencies, `${p}.dependencies`);
    pl.dependencies.forEach((d, j) => {
      needObj(d, `${p}.dependencies[${j}]`);
      needStr(d.name, `${p}.dependencies[${j}].name`);
      needStr(d.range, `${p}.dependencies[${j}].range`);
    });
    needStrArr(pl.install_commands, `${p}.install_commands`);
    assertTrust(pl.trust, `${p}.trust`);
    assertCost(pl.cost, `${p}.cost`);
  });

  index.artifacts.forEach((a, i) => {
    const p = `artifacts[${i}]`;
    needObj(a, p);
    if (!TYPES.includes(a.type)) fail(`${p}.type`, `must be one of ${TYPES.join(', ')}`);
    for (const k of ['name', 'plugin', 'description', 'body_excerpt', 'source_path']) needStr(a[k], `${p}.${k}`);
    if (a.body_excerpt.length > MAX_EXCERPT) fail(`${p}.body_excerpt`, `must be at most ${MAX_EXCERPT} chars`);
    needStrArr(a.install_commands, `${p}.install_commands`);
  });
}
