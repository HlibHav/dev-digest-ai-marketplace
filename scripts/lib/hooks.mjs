// Reads every hook declaration of a plugin (AC-7): default hooks/hooks.json, then plugin.json
// (inline object or custom path[s]), then the catalog entry. One result per matcher group.
import { existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { BuildError } from './errors.mjs';
import { CATALOG_REL, manifestRel, readJsonFile, relFromRoot, resolveDeclaredFile } from './discover.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function eventMap(map, file, where) {
  const out = [];
  for (const [event, groups] of Object.entries(map)) {
    if (!Array.isArray(groups)) throw new BuildError(file, `${where}.${event} must be an array of matcher groups`);
    groups.forEach((g, i) => {
      const at = `${where}.${event}[${i}]`;
      if (!isObj(g)) throw new BuildError(file, `${at} must be an object`);
      if (g.matcher !== undefined && typeof g.matcher !== 'string') throw new BuildError(file, `${at}.matcher must be a string`);
      if (!Array.isArray(g.hooks)) throw new BuildError(file, `${at} needs a "hooks" array`);
      const commands = g.hooks.map((h, j) => {
        if (!isObj(h)) throw new BuildError(file, `${at}.hooks[${j}] must be an object`);
        return h.command;
      }).filter((c) => typeof c === 'string');
      out.push({ event, matcher: g.matcher ? g.matcher : null, commands, source_path: file });
    });
  }
  return out;
}

function fromFile(abs, root) {
  const rel = relFromRoot(root, abs);
  const data = readJsonFile(abs, rel);
  if (!isObj(data) || !isObj(data.hooks)) throw new BuildError(rel, 'must have a top-level "hooks" object');
  return eventMap(data.hooks, rel, 'hooks');
}

function fromDeclaration(decl, ctx, loaded) {
  if (decl === undefined || decl === null) return [];
  if (Array.isArray(decl)) return decl.flatMap((d) => fromDeclaration(d, ctx, loaded));
  if (typeof decl === 'string') {
    const abs = resolveDeclaredFile(ctx.pluginDir, decl, ctx.declFile, 'hooks');
    if (loaded.has(abs)) return [];
    loaded.add(abs);
    return fromFile(abs, ctx.root);
  }
  if (isObj(decl)) return eventMap(isObj(decl.hooks) ? decl.hooks : decl, ctx.declFile, 'hooks');
  throw new BuildError(ctx.declFile, 'hooks must be an object, a path or an array of them');
}

/** readHooks({pluginDir, manifest, entry, root?}) -> [{event, matcher|null, commands[], source_path}] */
export function readHooks({ pluginDir, manifest = {}, entry = {}, root = dirname(dirname(pluginDir)) }) {
  const loaded = new Set();
  const out = [];
  const def = join(pluginDir, 'hooks', 'hooks.json');
  if (existsSync(def) && statSync(def).isFile()) {
    loaded.add(def);
    out.push(...fromFile(def, root));
  }
  out.push(...fromDeclaration(manifest.hooks, { pluginDir, root, declFile: manifestRel(root, pluginDir) }, loaded));
  out.push(...fromDeclaration(entry.hooks, { pluginDir, root, declFile: CATALOG_REL }, loaded));
  return out;
}
