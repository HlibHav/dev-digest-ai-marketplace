// Install builder: dependency closure, settings snippet and CLI commands. Pure, no DOM.
import { MARKETPLACE, REPO } from '../contract/index-contract.js';

export const RANGE_NOTE =
  'Version ranges resolve against <plugin>--v<semver> release tags at install time and are not checked by the site.';

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
