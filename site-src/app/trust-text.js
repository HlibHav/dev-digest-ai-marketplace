// Plain-text rendering of a plugin's trust profile. URLs stay text, never links (AC-36).
export const TRUST_NOTICE = 'This profile describes what this plugin declares, not a security audit.';
export const TRUST_EMPTY = 'This plugin declares no hooks, MCP servers or scripts.';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function hookLine(h) {
  const matcher = h.matcher === null ? 'no matcher' : `matcher: ${h.matcher}`;
  return `Hook ${h.event}${h.broad ? ' (broad)' : ''}, ${matcher}, from ${h.source_path}`;
}

function serverLine(s) {
  const what = s.transport === 'url' ? s.url : [s.command, ...s.args].join(' ');
  const kind = s.transport === 'url' ? 'URL' : 'local command';
  return `MCP server ${s.name}, ${kind}: ${what}${s.non_loopback ? ' (non-loopback)' : ''}, from ${s.source_path}`;
}

export function describeTrust(trust) {
  const hooks = trust.hooks ?? [];
  const servers = trust.mcp_servers ?? [];
  if (!hooks.length && !servers.length && !trust.has_scripts) {
    return { empty: true, sentence: TRUST_EMPTY, lines: [] };
  }
  const parts = [];
  if (hooks.length) {
    const broad = hooks.filter((h) => h.broad).length;
    parts.push(`${plural(hooks.length, 'hook')}${broad ? ` (${broad} broad)` : ''}`);
  }
  if (servers.length) {
    const far = servers.filter((s) => s.non_loopback).length;
    parts.push(`${plural(servers.length, 'MCP server')}${far ? ` (${far} non-loopback)` : ''}`);
  }
  if (trust.has_scripts) parts.push('a scripts/ folder');
  const lines = [...hooks.map(hookLine), ...servers.map(serverLine)];
  if (trust.has_scripts) lines.push('Contains a scripts/ folder');
  return { empty: false, sentence: `Declares ${parts.join(', ')}.`, lines };
}
