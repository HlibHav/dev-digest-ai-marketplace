// Finds the file-based artifacts of one plugin: skills, agents and commands.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { BuildError } from './errors.mjs';
import { parseFrontmatter } from './frontmatter.mjs';
import { agentName, commandName, skillName } from './names.mjs';

const MAX_COMMAND_FALLBACK = 200;

/** Path relative to the repo root with forward slashes, for messages and `source_path`. */
export const relFromRoot = (root, abs) => relative(root, abs).split(sep).join('/');

/** Reads and parses a JSON file; every failure is a BuildError naming the file. */
export function readJsonFile(abs, rel) {
  let text;
  try {
    text = readFileSync(abs, 'utf8');
  } catch (e) {
    throw new BuildError(rel, `cannot be read (${e.code ?? e.message})`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new BuildError(rel, `is not valid JSON (${e.message})`);
  }
}

/** Resolves a path declared in plugin.json or the catalog; it must stay inside the plugin and exist as a file. */
export function resolveDeclaredFile(pluginDir, declared, declFile, label) {
  if (typeof declared !== 'string' || declared.trim() === '') {
    throw new BuildError(declFile, `${label} path must be a non-empty string`);
  }
  const abs = resolve(pluginDir, declared);
  const rel = relative(pluginDir, abs);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new BuildError(declFile, `${label} path "${declared}" points outside the plugin directory`);
  }
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    throw new BuildError(declFile, `${label} path "${declared}" does not exist`);
  }
  return abs;
}

export const CATALOG_REL = '.claude-plugin/marketplace.json';
export const manifestRel = (root, pluginDir) => relFromRoot(root, join(pluginDir, '.claude-plugin', 'plugin.json'));

const isDir = (p) => existsSync(p) && statSync(p).isDirectory();
const isFile = (p) => existsSync(p) && statSync(p).isFile();
const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sortedNames = (dir) => readdirSync(dir).sort(byCodeUnit);

function nonEmptyString(v) {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function read(abs, rel) {
  try {
    return readFileSync(abs, 'utf8');
  } catch (e) {
    throw new BuildError(rel, `cannot be read (${e.code ?? e.message})`);
  }
}

function discoverSkills(pluginDir, plugin, root) {
  const base = join(pluginDir, 'skills');
  if (!isDir(base)) return [];
  const out = [];
  for (const folder of sortedNames(base)) {
    const file = join(base, folder, 'SKILL.md');
    if (!isDir(join(base, folder)) || !isFile(file)) continue;
    const rel = relFromRoot(root, file);
    const { data, body, hasFrontmatter } = parseFrontmatter(read(file, rel), rel);
    const description = nonEmptyString(data.description);
    if (!description) {
      throw new BuildError(
        rel,
        hasFrontmatter
          ? 'skill frontmatter needs a non-empty "description"'
          : 'skill needs frontmatter with a non-empty "description"',
      );
    }
    const short = nonEmptyString(data.name) ?? folder;
    out.push({
      type: 'skill',
      name: skillName(plugin, folder, nonEmptyString(data.name)),
      short_name: short,
      plugin,
      description,
      body: body.trim(),
      source_path: rel,
    });
  }
  return out;
}

function discoverAgents(pluginDir, plugin, root) {
  const base = join(pluginDir, 'agents');
  if (!isDir(base)) return [];
  const out = [];
  for (const f of sortedNames(base)) {
    const file = join(base, f);
    if (!/\.md$/i.test(f) || !isFile(file)) continue;
    const rel = relFromRoot(root, file);
    const { data, body, hasFrontmatter } = parseFrontmatter(read(file, rel), rel);
    if (!hasFrontmatter) throw new BuildError(rel, 'agent needs frontmatter with a non-empty "description"');
    const description = nonEmptyString(data.description);
    if (!description) throw new BuildError(rel, 'agent frontmatter needs a non-empty "description"');
    const short = nonEmptyString(data.name) ?? f.replace(/\.md$/i, '');
    out.push({
      type: 'agent',
      name: agentName(plugin, short),
      short_name: short,
      plugin,
      description,
      body: body.trim(),
      source_path: rel,
    });
  }
  return out;
}

function walkMarkdown(dir, prefix = '') {
  const out = [];
  for (const entry of sortedNames(dir)) {
    const abs = join(dir, entry);
    const rel = prefix ? `${prefix}/${entry}` : entry;
    if (isDir(abs)) out.push(...walkMarkdown(abs, rel));
    else if (/\.md$/i.test(entry) && isFile(abs)) out.push(rel);
  }
  return out;
}

function discoverCommands(pluginDir, plugin, root) {
  const base = join(pluginDir, 'commands');
  if (!isDir(base)) return [];
  return walkMarkdown(base).map((relInCommands) => {
    const file = join(base, ...relInCommands.split('/'));
    const rel = relFromRoot(root, file);
    const { data, body } = parseFrontmatter(read(file, rel), rel);
    const trimmed = body.trim();
    const firstLine = trimmed.split(/\r?\n/).find((l) => l.trim() !== '') ?? '';
    const description = nonEmptyString(data.description) ?? firstLine.trim().slice(0, MAX_COMMAND_FALLBACK);
    const stem = relInCommands.replace(/\.md$/i, '');
    return {
      type: 'command',
      name: commandName(plugin, relInCommands),
      short_name: stem.split('/').join(':'),
      plugin,
      description,
      body: trimmed,
      source_path: rel,
    };
  });
}

/**
 * discoverFileArtifacts(pluginDir, pluginName, {root?}) -> Artifact[]
 * Skills, then agents, then commands, each sorted by path. `body` is the full trimmed body;
 * `source_path` is relative to `root` (default: two levels above the plugin directory).
 */
export function discoverFileArtifacts(pluginDir, pluginName, { root = dirname(dirname(pluginDir)) } = {}) {
  return [
    ...discoverSkills(pluginDir, pluginName, root),
    ...discoverAgents(pluginDir, pluginName, root),
    ...discoverCommands(pluginDir, pluginName, root),
  ];
}
