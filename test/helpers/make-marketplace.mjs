// Writes a small marketplace tree for tests. Never writes under the repo's own plugins/.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const write = (file, content) => {
  mkdirSync(dirname(file), { recursive: true });
  const text = typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`;
  writeFileSync(file, text);
};

/**
 * makeMarketplace(dir, { catalog?, plugins: [{ name, version?, description?, category?, tags?,
 *   dependencies?, manifest?, entry?, files? }] }) -> dir
 * `files` maps a relative path to a string, or to an object written as JSON; `null` skips a default file.
 * Every plugin gets a CHANGELOG.md (first heading = its version), COMPATIBILITY.md and LICENSE unless `files` says otherwise.
 * `manifest` is merged over the generated plugin.json; `entry` is merged over the catalog entry.
 */
export function makeMarketplace(dir, { catalog = {}, plugins = [] } = {}) {
  const entries = [];
  for (const p of plugins) {
    const description = p.description ?? `The ${p.name} plugin`;
    const category = p.category ?? 'demo';
    const tags = p.tags ?? [];
    entries.push({
      name: p.name,
      source: `./plugins/${p.name}`,
      description,
      category,
      tags,
      ...(p.entry ?? {}),
    });
    const pluginDir = join(dir, 'plugins', p.name);
    const manifest = {
      name: p.name,
      version: p.version ?? '0.1.0',
      description,
      ...(p.dependencies ? { dependencies: p.dependencies } : {}),
      ...(p.manifest ?? {}),
    };
    write(join(pluginDir, '.claude-plugin', 'plugin.json'), manifest);
    write(join(pluginDir, 'README.md'), `# ${p.name}\n\n${description}\n`);
    const version = p.version ?? '0.1.0';
    const files = {
      'CHANGELOG.md': `# Changelog\n\n## ${version}\n\n- Initial release.\n`,
      'COMPATIBILITY.md': '# Compatibility\n\n- Claude Code >=2.1.0\n',
      LICENSE: 'MIT License\n',
      ...(p.files ?? {}),
    };
    for (const [rel, content] of Object.entries(files)) if (content !== null) write(join(pluginDir, rel), content);
  }
  write(join(dir, '.claude-plugin', 'marketplace.json'), {
    name: 'fixture-marketplace',
    owner: { name: 'fixture' },
    description: 'Fixture marketplace',
    ...catalog,
    plugins: entries,
  });
  return dir;
}
