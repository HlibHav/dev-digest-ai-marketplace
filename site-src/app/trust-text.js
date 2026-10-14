// Plain-text rendering of a plugin's trust profile. URLs stay text, never links (AC-36).
import { t } from '../i18n/t.js';
export const TRUST_NOTICE = t('trust.notice');
export const TRUST_EMPTY = t('trust.empty');

function hookLine(h) {
  const matcher = h.matcher === null ? t('trust.noMatcher') : t('trust.matcher', { matcher: h.matcher });
  return t('trust.hookLine', { event: h.event, broad: h.broad ? ` ${t('trust.broadMark')}` : '', matcher, source: h.source_path });
}

function serverLine(s) {
  const what = s.transport === 'url' ? s.url : [s.command, ...s.args].join(' ');
  const kind = s.transport === 'url' ? t('trust.kindUrl') : t('trust.kindCommand');
  return t('trust.serverLine', { name: s.name, kind, what, nonLoopback: s.non_loopback ? ` ${t('trust.nonLoopbackMark')}` : '', source: s.source_path });
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
    parts.push(`${t('trust.hooksPart', { count: hooks.length })}${broad ? ` ${t('trust.broadCount', { count: broad })}` : ''}`);
  }
  if (servers.length) {
    const far = servers.filter((s) => s.non_loopback).length;
    parts.push(`${t('trust.serversPart', { count: servers.length })}${far ? ` ${t('trust.nonLoopbackCount', { count: far })}` : ''}`);
  }
  if (trust.has_scripts) parts.push(t('trust.scriptsPart'));
  const lines = [...hooks.map(hookLine), ...servers.map(serverLine)];
  if (trust.has_scripts) lines.push(t('trust.scriptsLine'));
  return { empty: false, sentence: t('trust.declares', { parts: parts.join(', ') }), lines };
}

/**
 * One row per line of describeTrust(), with neutral fact flags ("broad matcher", "non-loopback", "scripts").
 * A flag states a fact about the declaration. It is never a verdict.
 */
export function trustRows(trust) {
  const { lines } = describeTrust(trust);
  const hooks = trust.hooks ?? [];
  const servers = trust.mcp_servers ?? [];
  const flags = [
    ...hooks.map((hook) => (hook.broad ? [t('trust.flagBroad')] : [])),
    ...servers.map((server) => (server.non_loopback ? [t('trust.flagNonLoopback')] : [])),
  ];
  if (trust.has_scripts) flags.push([t('trust.flagScripts')]);
  return lines.map((text, i) => ({ text, flags: flags[i] ?? [] }));
}

const fmt = (n) => n.toLocaleString(t('meta.locale'));

/** The facts shown on the closed line of a plugin's disclosure: what it declares and what it loads up front. */
export function describeFacts(trust, cost) {
  const tr = describeTrust(trust);
  const declared = tr.empty ? t('trust.declaresNothing') : tr.sentence.replace(/\.$/, '');
  const loaded = cost?.always_loaded_tokens > 0 ? t('trust.loadedTokens', { tokens: fmt(cost.always_loaded_tokens) }) : t('trust.loadedNone');
  return t('trust.facts', { declared, loaded });
}
