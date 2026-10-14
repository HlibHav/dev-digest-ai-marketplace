// Install builder: dependency closure, settings snippet and CLI commands. Pure, no DOM.
import { MARKETPLACE, REPO } from '../contract/index-contract.js';
import { t } from '../i18n/t.js';

export const RANGE_NOTE = t('builder.rangeNote');

/**
 * Expands `selected` with every transitive dependency.
 * Entry order: the selected plugins (first mention wins), then added plugins in discovery order.
 * `ranges` are the ranges other plugins in the set declare for the entry; `requiredBy` names them.
 */
export function resolveSelection(plugins, selected) {
  const byName = new Map(plugins.map((p) => [p.name, p]));
  const chosen = [];
  for (const name of selected) {
    if (byName.has(name) && !chosen.includes(name)) chosen.push(name);
  }
  const order = [...chosen];
  const seen = new Set(order);
  for (let i = 0; i < order.length; i += 1) {
    for (const dep of byName.get(order[i]).dependencies ?? []) {
      if (byName.has(dep.name) && !seen.has(dep.name)) {
        seen.add(dep.name);
        order.push(dep.name);
      }
    }
  }
  const entries = order.map((name) => ({ name, auto: !chosen.includes(name), ranges: [], requiredBy: [] }));
  const entryOf = new Map(entries.map((e) => [e.name, e]));
  for (const from of order) {
    for (const dep of byName.get(from).dependencies ?? []) {
      const target = entryOf.get(dep.name);
      if (!target) continue;
      target.ranges.push({ from, range: dep.range });
      if (!target.requiredBy.includes(from)) target.requiredBy.push(from);
    }
  }
  return { entries };
}

export function settingsSnippet(entries) {
  if (!entries.length) return '';
  const enabledPlugins = {};
  for (const e of entries) enabledPlugins[`${e.name}@${MARKETPLACE}`] = true;
  return JSON.stringify(
    {
      extraKnownMarketplaces: { [MARKETPLACE]: { source: { source: 'github', repo: REPO } } },
      enabledPlugins,
    },
    null,
    2,
  );
}

export function cliCommands(entries) {
  if (!entries.length) return '';
  return [`/plugin marketplace add ${REPO}`, ...entries.map((e) => `/plugin install ${e.name}@${MARKETPLACE}`)].join('\n');
}

/**
 * Map<name, string[]>: for each entry, the plugins the user ticked that need it, directly or through an
 * automatically added plugin. Unticking all of them is what frees the entry.
 */
export function chosenParents(entries) {
  const byName = new Map(entries.map((e) => [e.name, e]));
  const out = new Map();
  for (const entry of entries) {
    const found = new Set();
    const seen = new Set([entry.name]);
    const stack = [...entry.requiredBy];
    while (stack.length) {
      const name = stack.pop();
      if (seen.has(name)) continue;
      seen.add(name);
      const parent = byName.get(name);
      if (!parent) continue;
      if (!parent.auto) found.add(name);
      stack.push(...parent.requiredBy);
    }
    out.set(entry.name, entries.map((e) => e.name).filter((n) => found.has(n)));
  }
  return out;
}
