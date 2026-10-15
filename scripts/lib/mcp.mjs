// Reads every MCP server declaration of a plugin (AC-7): default .mcp.json, then plugin.json
// (inline map or custom path[s]), then the catalog entry.
import { existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { BuildError } from './errors.mjs';
import { CATALOG_REL, manifestRel, readJsonFile, relFromRoot, resolveDeclaredFile } from './discover.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function serverMap(map, file) {
  const out = [];
  for (const [name, def] of Object.entries(map)) {
    if (!isObj(def)) throw new BuildError(file, `MCP server "${name}" must be an object`);
    if (def.args !== undefined && !Array.isArray(def.args)) throw new BuildError(file, `MCP server "${name}": args must be an array`);
    const args = (def.args ?? []).map(String);
    if (typeof def.command === 'string' && def.command !== '') {
      out.push({ name, transport: 'command', command: def.command, args, source_path: file });
    } else if (typeof def.url === 'string' && def.url !== '') {
      out.push({ name, transport: 'url', url: def.url, args: [], source_path: file });
    } else {
      throw new BuildError(file, `MCP server "${name}" needs a "command" or a "url"`);
    }
  }
  return out;
}

/** `{ "mcpServers": {...} }` or a flat server map. */
function unwrap(obj) {
  return isObj(obj.mcpServers) ? obj.mcpServers : obj;
}

function fromFile(abs, root) {
  const rel = relFromRoot(root, abs);
  const data = readJsonFile(abs, rel, root);
  if (!isObj(data)) throw new BuildError(rel, 'must be a JSON object');
  if ('mcpServers' in data && !isObj(data.mcpServers)) throw new BuildError(rel, '"mcpServers" must be an object');
  return serverMap(unwrap(data), rel);
}

function fromDeclaration(decl, ctx, loaded) {
  if (decl === undefined || decl === null) return [];
  if (Array.isArray(decl)) return decl.flatMap((d) => fromDeclaration(d, ctx, loaded));
  if (typeof decl === 'string') {
    const abs = resolveDeclaredFile(ctx.pluginDir, decl, ctx.declFile, 'mcpServers');
    if (loaded.has(abs)) return [];
    loaded.add(abs);
    return fromFile(abs, ctx.root);
  }
  if (isObj(decl)) return serverMap(unwrap(decl), ctx.declFile);
  throw new BuildError(ctx.declFile, 'mcpServers must be an object, a path or an array of them');
}

/** readMcpServers({pluginDir, manifest, entry, root?}) -> [{name, transport, command?, args[], url?, source_path}] */
export function readMcpServers({ pluginDir, manifest = {}, entry = {}, root = dirname(dirname(pluginDir)) }) {
  const loaded = new Set();
  const out = [];
  const def = join(pluginDir, '.mcp.json');
  if (existsSync(def) && statSync(def).isFile()) {
    loaded.add(def);
    out.push(...fromFile(def, root));
  }
  out.push(...fromDeclaration(manifest.mcpServers, { pluginDir, root, declFile: manifestRel(root, pluginDir) }, loaded));
  out.push(...fromDeclaration(entry.mcpServers, { pluginDir, root, declFile: CATALOG_REL }, loaded));
  return out;
}
