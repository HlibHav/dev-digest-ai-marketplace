// Builds the catalog index (AC-1 to AC-10, AC-41, AC-42). Pure computation over files under `root`:
// no network, no clock, no randomness. Every failure is a BuildError and nothing is written here.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MARKETPLACE, REPO, SCHEMA_VERSION, TYPES, assertIndexShape } from '../../site-src/contract/index-contract.js';
import { DEFAULT_INDEX_BUDGET_GZIP_BYTES, checkIndexBudget, excerpt } from './budget.mjs';
import { buildCost } from './cost.mjs';
import { assertUniqueNames, normalizeDependencies, validateDependencies } from './deps.mjs';
import { CATALOG_REL, discoverFileArtifacts, manifestRel, readJsonFile, relFromRoot } from './discover.mjs';
import { BuildError } from './errors.mjs';
import { readHooks } from './hooks.mjs';
import { readMcpServers } from './mcp.mjs';
import { hookName, mcpName } from './names.mjs';
import { parseChangelog, parseCompatibility } from './plugin-docs.mjs';
import { buildTrust } from './trust.mjs';
import { PathEscapeError, assertRealInside, resolveInside } from './safe-path.mjs';

export const ADD_COMMAND = `/plugin marketplace add ${REPO}`;
export const installCommand = (plugin) => `/plugin install ${plugin}@${MARKETPLACE}`;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function loadPlugins(root) {
  const catalog = readJsonFile(resolveInside(root, CATALOG_REL), CATALOG_REL, root);
  if (!isObj(catalog) || !Array.isArray(catalog.plugins)) throw new BuildError(CATALOG_REL, '"plugins" must be an array');

  return catalog.plugins.map((entry, i) => {
    if (!isObj(entry) || typeof entry.name !== 'string' || entry.name === '' || typeof entry.source !== 'string') {
      throw new BuildError(CATALOG_REL, `plugins[${i}] needs a string "name" and a string "source"`);
    }
    // `source` comes from the catalog, which contributors edit: contain it lexically and through symlinks.
    let pluginDir;
    try {
      pluginDir = resolveInside(root, entry.source);
      if (pluginDir === resolveInside(root)) throw new PathEscapeError(root, entry.source, 'is the repository root');
      assertRealInside(root, pluginDir);
    } catch (e) {
      if (e instanceof PathEscapeError) {
        throw new BuildError(CATALOG_REL, `plugin "${entry.name}": source "${entry.source}" points outside the repository`);
      }
      throw e;
    }
    const file = manifestRel(root, pluginDir);
    const manifest = readJsonFile(join(pluginDir, '.claude-plugin', 'plugin.json'), file, pluginDir);
    if (!isObj(manifest)) throw new BuildError(file, 'must be a JSON object');
    if (typeof manifest.version !== 'string' || manifest.version === '') {
      throw new BuildError(file, '"version" must be a non-empty string');
    }
    return { entry, pluginDir, manifest, file };
  });
}

/** Text of an optional plugin file, or null when it is absent; a file that cannot be read is a BuildError. */
function readOptional(pluginDir, name, root) {
  const abs = join(pluginDir, name);
  if (!existsSync(abs) || !statSync(abs).isFile()) return null;
  try {
    assertRealInside(pluginDir, abs);
    return readFileSync(abs, 'utf8');
  } catch (e) {
    throw new BuildError(relFromRoot(root, abs), `cannot be read (${e.code ?? e.message})`);
  }
}

function hookArtifact(plugin, h, n, installs) {
  const where = h.matcher ? ` on ${h.matcher}` : '';
  const what = h.commands.length ? `: ${h.commands.join('; ')}` : '';
  return {
    type: 'hook', name: hookName(plugin, h.event, n), plugin,
    description: `${h.event} hook${where}${what}`,
    body_excerpt: '', source_path: h.source_path, install_commands: installs,
  };
}

function mcpArtifact(plugin, s, installs) {
  const detail = s.transport === 'url' ? s.url : [s.command, ...s.args].join(' ');
  return {
    type: 'mcp_server', name: mcpName(plugin, s.name), plugin,
    description: `${s.transport} MCP server: ${detail}`,
    body_excerpt: '', source_path: s.source_path, install_commands: installs,
  };
}

/**
 * buildIndex({root, indexBudgetGzipBytes?}) -> {index, json}
 * `json` is the compact serialisation with a trailing newline, the exact bytes of index.json.
 */
export function buildIndex({ root, indexBudgetGzipBytes = DEFAULT_INDEX_BUDGET_GZIP_BYTES }) {
  const loaded = loadPlugins(root);
  validateDependencies(loaded.map((p) => ({ name: p.entry.name, file: p.file, dependencies: p.manifest.dependencies })));

  const plugins = [];
  const artifacts = [];
  for (const { entry, pluginDir, manifest, file } of loaded) {
    const name = entry.name;
    const installs = [ADD_COMMAND, installCommand(name)];
    const fileArtifacts = discoverFileArtifacts(pluginDir, name, { root });
    const hooks = readHooks({ pluginDir, manifest, entry, root });
    const servers = readMcpServers({ pluginDir, manifest, entry, root });
    const scriptsDir = join(pluginDir, 'scripts');
    const hasScripts = existsSync(scriptsDir) && statSync(scriptsDir).isDirectory();

    const compatibility = readOptional(pluginDir, 'COMPATIBILITY.md', root);
    const changelog = readOptional(pluginDir, 'CHANGELOG.md', root);

    const perEvent = new Map();
    const hookArtifacts = hooks.map((h) => {
      const n = perEvent.get(h.event) ?? 0;
      perEvent.set(h.event, n + 1);
      return hookArtifact(name, h, n, installs);
    });
    const own = [
      ...fileArtifacts.map((a) => ({
        type: a.type, name: a.name, plugin: name, description: a.description,
        body_excerpt: excerpt(a.body), source_path: a.source_path, install_commands: installs,
      })),
      ...hookArtifacts,
      ...servers.map((s) => mcpArtifact(name, s, installs)),
    ];
    assertUniqueNames(own);
    own.sort((a, b) => TYPES.indexOf(a.type) - TYPES.indexOf(b.type) || byCodeUnit(a.name, b.name));
    artifacts.push(...own);

    plugins.push({
      name,
      version: manifest.version,
      description: String(manifest.description ?? entry.description ?? ''),
      category: typeof entry.category === 'string' ? entry.category : '',
      tags: Array.isArray(entry.tags) ? entry.tags.filter((t) => typeof t === 'string') : [],
      dependencies: normalizeDependencies(manifest.dependencies, file),
      install_commands: installs,
      compatibility: compatibility ? parseCompatibility(compatibility) : null,
      changelog: changelog ? parseChangelog(changelog).slice(0, 3) : [],
      trust: buildTrust({ hooks, servers, hasScripts }),
      cost: buildCost(fileArtifacts),
    });
  }

  const index = { schema_version: SCHEMA_VERSION, marketplace: MARKETPLACE, plugins, artifacts };
  try {
    assertIndexShape(index);
  } catch (e) {
    throw new BuildError('index', `built index breaks the contract: ${e.message}`);
  }
  const json = `${JSON.stringify(index)}\n`;
  checkIndexBudget(index, json, indexBudgetGzipBytes);
  return { index, json };
}
