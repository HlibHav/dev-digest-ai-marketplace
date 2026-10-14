// Dependency and name validation (AC-5). Everything here throws BuildError(file, rule).
import { BuildError } from './errors.mjs';

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/**
 * parseDependency(d, file, i) -> {name, range}
 * Two spellings of one dependency in plugin.json:
 *   object  {"name": "x", "version": "^1.0.0"}
 *   string  "x@marketplace@^1.0.0" (also "x@^1.0.0")
 * The range must be a ^ or ~ range over a full semver. check-repo additionally requires ^.
 */
export function parseDependency(d, file, i = 0) {
  let name;
  let range;
  if (typeof d === 'string') {
    const parts = d.split('@');
    if (parts.length < 2 || parts.length > 3 || parts[0] === '') {
      throw new BuildError(file, `dependency "${d}" is a bare string; use {"name": "${parts[0]}", "version": "^x.y.z"} or "${parts[0]}@marketplace@^x.y.z"`);
    }
    name = parts[0];
    range = parts[parts.length - 1];
  } else {
    if (d === null || typeof d !== 'object' || Array.isArray(d)) {
      throw new BuildError(file, `dependencies[${i}] must be an object with "name" and "version", or a "name@marketplace@^x.y.z" string`);
    }
    if (typeof d.name !== 'string' || d.name === '') throw new BuildError(file, `dependencies[${i}] needs a string "name"`);
    if (typeof d.version !== 'string') throw new BuildError(file, `dependency "${d.name}" needs a string "version" range`);
    name = d.name;
    range = d.version;
  }
  const [, op, rest] = /^(~|\^|>=|<=|>|<|=)?(.*)$/s.exec(range);
  if (!SEMVER.test(rest)) throw new BuildError(file, `dependency "${name}": range "${range}" is not a semver range`);
  if (op !== '~' && op !== '^') throw new BuildError(file, `dependency "${name}": range "${range}" must be a ^ or ~ range such as ^${rest}`);
  return { name, range };
}

/**
 * normalizeDependencies(raw, file) -> [{name, range}]
 * `raw` is the `dependencies` array of plugin.json (object or string spelling, see parseDependency).
 */
export function normalizeDependencies(raw, file) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new BuildError(file, '"dependencies" must be an array of {name, version} objects or "name@marketplace@^x.y.z" strings');
  return raw.map((d, i) => parseDependency(d, file, i));
}

/**
 * findCycle(edges) -> {cycle: "a -> b -> a", root} | null
 * edges: Map<name, name[]>. `root` is the node the walk started from when it hit the cycle.
 */
export function findCycle(edges) {
  const state = new Map(); // 1 = on the current path, 2 = done
  const stack = [];
  let found = null;
  const visit = (name) => {
    if (found || state.get(name) === 2) return;
    if (state.get(name) === 1) {
      found = { cycle: [...stack.slice(stack.indexOf(name)), name].join(' -> '), root: stack[0] };
      return;
    }
    state.set(name, 1);
    stack.push(name);
    for (const next of edges.get(name) ?? []) visit(next);
    stack.pop();
    state.set(name, 2);
  };
  for (const name of edges.keys()) visit(name);
  return found;
}

/**
 * validateDependencies(plugins) -> void
 * plugins: [{name, file, dependencies: raw array from plugin.json}] in catalog order.
 */
export function validateDependencies(plugins) {
  const byName = new Map();
  for (const p of plugins) {
    if (byName.has(p.name)) throw new BuildError(p.file, `duplicate plugin name "${p.name}" in the catalog`);
    byName.set(p.name, p);
  }
  const edges = new Map();
  for (const p of plugins) {
    const deps = normalizeDependencies(p.dependencies, p.file);
    for (const d of deps) {
      if (!byName.has(d.name)) throw new BuildError(p.file, `dependency "${d.name}" is not in the catalog`);
    }
    edges.set(p.name, deps.map((d) => d.name));
  }
  const hit = findCycle(edges);
  if (hit) throw new BuildError(byName.get(hit.root).file, `dependency cycle: ${hit.cycle}`);
}

/** assertUniqueNames(artifacts) -> void. Two artifacts with one namespaced name fail the build. */
export function assertUniqueNames(artifacts) {
  const seen = new Map();
  for (const a of artifacts) {
    const first = seen.get(a.name);
    if (first) throw new BuildError(a.source_path, `duplicate name "${a.name}" (also defined in ${first.source_path})`);
    seen.set(a.name, a);
  }
}
