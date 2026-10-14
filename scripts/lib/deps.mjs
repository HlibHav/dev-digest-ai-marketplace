// Dependency and name validation (AC-5). Everything here throws BuildError(file, rule).
import { BuildError } from './errors.mjs';

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/**
 * normalizeDependencies(raw, file) -> [{name, range}]
 * `raw` is the `dependencies` array of plugin.json: objects `{name, version}` with a `~` range.
 */
export function normalizeDependencies(raw, file) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new BuildError(file, '"dependencies" must be an array of {name, version} objects');
  return raw.map((d, i) => {
    if (typeof d === 'string') {
      throw new BuildError(file, `dependency "${d}" is a bare string; use {"name": "${d}", "version": "~x.y.z"}`);
    }
    if (d === null || typeof d !== 'object' || Array.isArray(d)) {
      throw new BuildError(file, `dependencies[${i}] must be an object with "name" and "version"`);
    }
    if (typeof d.name !== 'string' || d.name === '') throw new BuildError(file, `dependencies[${i}] needs a string "name"`);
    if (typeof d.version !== 'string') throw new BuildError(file, `dependency "${d.name}" needs a string "version" range`);
    const range = d.version;
    const [, op, rest] = /^(~|\^|>=|<=|>|<|=)?(.*)$/s.exec(range);
    if (!SEMVER.test(rest)) throw new BuildError(file, `dependency "${d.name}": range "${range}" is not a semver range`);
    if (op !== '~') throw new BuildError(file, `dependency "${d.name}": range "${range}" must be a ~ range such as ~${rest}`);
    return { name: d.name, range };
  });
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

  const state = new Map(); // 1 = on the current path, 2 = done
  const stack = [];
  const visit = (name) => {
    if (state.get(name) === 2) return;
    if (state.get(name) === 1) {
      const cycle = [...stack.slice(stack.indexOf(name)), name].join(' -> ');
      throw new BuildError(byName.get(stack[0]).file, `dependency cycle: ${cycle}`);
    }
    state.set(name, 1);
    stack.push(name);
    for (const next of edges.get(name)) visit(next);
    stack.pop();
    state.set(name, 2);
  };
  for (const p of plugins) visit(p.name);
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
