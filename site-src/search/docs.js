// Turns the catalog index into flat search documents (contract: docs/CATALOG-CONTRACTS.md).
// Isomorphic: no node:* imports, no DOM access.

/**
 * `doc = { id, type, name, plugin, description, body, tags[], category }`.
 * Plugin documents come from `plugins[]`; an artifact of type "plugin" is ignored so a plugin never
 * appears twice. Artifacts inherit the owning plugin's tags and category.
 */
export function buildDocs(index) {
  const owner = new Map(index.plugins.map((p) => [p.name, p]));
  const docs = [];
  const used = new Set();
  const add = (doc) => {
    let id = doc.id;
    for (let n = 2; used.has(id); n += 1) id = `${doc.id}#${n}`;
    used.add(id);
    docs.push({ ...doc, id });
  };
  for (const p of index.plugins) {
    add({
      id: `plugin:${p.name}`, type: 'plugin', name: p.name, plugin: p.name,
      description: p.description, body: '', tags: [...p.tags], category: p.category,
    });
  }
  for (const a of index.artifacts) {
    if (a.type === 'plugin') continue;
    const p = owner.get(a.plugin);
    add({
      id: `${a.type}:${a.plugin}:${a.name}`, type: a.type, name: a.name, plugin: a.plugin,
      description: a.description, body: a.body_excerpt, tags: p ? [...p.tags] : [], category: p ? p.category : '',
    });
  }
  return docs;
}
