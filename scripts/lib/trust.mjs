// Static trust profile (AC-33 to AC-35): what a plugin declares, not a security audit.

export const BROAD_EVENTS = Object.freeze(['UserPromptSubmit', 'PreToolUse', 'PostToolUse']);

const URL_IN_TEXT = /\b(?:https?|wss?):\/\/[^\s"'`<>\\]+/g;

/** True when the URL's host is localhost, 127.0.0.0/8 or ::1. Unparsable input is not loopback. */
export function isLoopbackUrl(url) {
  let host;
  try {
    host = new URL(String(url)).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (host === 'localhost' || host === '[::1]') return true;
  const m = /^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  return m !== null && [m[1], m[2], m[3]].every((o) => Number(o) <= 255);
}

function urlsIn(text) {
  const out = [];
  for (const raw of String(text).match(URL_IN_TEXT) ?? []) {
    let u = raw;
    // Trim sentence punctuation, but keep the closing bracket of an IPv6 host.
    while (/[.,;:)}\]]$/.test(u) && !(u.endsWith(']') && u.includes('['))) u = u.slice(0, -1);
    out.push(u);
  }
  return out;
}

const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * buildTrust({hooks, servers, hasScripts}) -> trust
 * `hooks` come from readHooks, `servers` from readMcpServers.
 */
export function buildTrust({ hooks, servers, hasScripts }) {
  const urls = new Set();
  const trustHooks = hooks.map((h) => {
    for (const c of h.commands ?? []) urlsIn(c).forEach((u) => urls.add(u));
    return { event: h.event, matcher: h.matcher ?? null, broad: BROAD_EVENTS.includes(h.event), source_path: h.source_path };
  });
  const trustServers = servers.map((s) => {
    if (s.transport === 'url') {
      urlsIn(s.url).forEach((u) => urls.add(u));
      return { name: s.name, transport: 'url', url: s.url, args: [], non_loopback: !isLoopbackUrl(s.url), source_path: s.source_path };
    }
    urlsIn(s.command).forEach((u) => urls.add(u));
    (s.args ?? []).forEach((a) => urlsIn(a).forEach((u) => urls.add(u)));
    return { name: s.name, transport: 'command', command: s.command, args: [...(s.args ?? [])], non_loopback: false, source_path: s.source_path };
  });
  return { hooks: trustHooks, mcp_servers: trustServers, has_scripts: Boolean(hasScripts), network_urls: [...urls].sort(byCodeUnit) };
}
