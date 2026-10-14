// Namespaced artifact names (AC-2, AC-6).
const stripMd = (p) => p.replace(/\.md$/i, '');

export const skillName = (plugin, folder, fmName) => `/${plugin}:${fmName || folder}`;

/** relPath is relative to the plugin's commands/ directory; each subfolder adds a ":" segment. */
export const commandName = (plugin, relPath) =>
  `/${plugin}:${stripMd(relPath).split(/[\\/]/).filter(Boolean).join(':')}`;

export const agentName = (plugin, name) => `${plugin}:${name}`;

export const mcpName = (plugin, server) => `${plugin}/${server}`;

export const hookName = (plugin, event, n) => `${plugin}/${event}#${n}`;
