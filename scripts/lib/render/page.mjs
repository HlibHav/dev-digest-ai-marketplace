// Static page renderer. Everything that comes from the index is escaped; the plugin list is readable without JavaScript.
import { MARKETPLACE, REPO } from '../../../site-src/contract/index-contract.js';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

const SEARCH_LABEL = 'Search plugins, skills, agents, commands, hooks and MCP servers';

function dependencies(deps) {
  if (!deps.length) return '<p class="deps">No dependencies</p>';
  const items = deps.map((d) => `<li><code>${esc(d.name)}</code> <span class="range">${esc(d.range)}</span></li>`);
  return `<div class="deps"><p class="deps-title">Depends on</p><ul class="deps-list">${items.join('')}</ul></div>`;
}

function pluginCard(plugin) {
  const install = esc((plugin.install_commands ?? []).join('\n'));
  return [
    `<li class="card" data-card data-type="plugin" data-plugin="${esc(plugin.name)}">`,
    '<div class="card-head">',
    '<span class="badge">plugin</span>',
    `<h3 class="card-title">${esc(plugin.name)}</h3>`,
    `<span class="version">v${esc(plugin.version)}</span>`,
    '</div>',
    `<p class="card-desc">${esc(plugin.description)}</p>`,
    `<p class="meta">Category: <span class="category">${esc(plugin.category)}</span></p>`,
    dependencies(plugin.dependencies ?? []),
    `<pre class="install"><code>${install}</code></pre>`,
    '</li>',
  ].join('');
}

/** renderPage({index, assets: {css[], js[], indexUrl}, csp}) -> HTML string. All URLs stay as given (relative). */
export function renderPage({ index, assets, csp }) {
  const plugins = index.plugins ?? [];
  const css = (assets.css ?? []).map((href) => `<link rel="stylesheet" href="${esc(href)}">`).join('\n');
  const js = (assets.js ?? []).map((src) => `<script type="module" src="${esc(src)}"></script>`).join('\n');
  const count = `${plugins.length} ${plugins.length === 1 ? 'plugin' : 'plugins'}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${esc(csp)}">
<title>${esc(index.marketplace ?? MARKETPLACE)} catalog</title>
<meta name="description" content="Search the plugins, skills, agents, commands, hooks and MCP servers of ${esc(index.marketplace ?? MARKETPLACE)}.">
${css}
</head>
<body>
<header id="site-header" class="site-header" data-fx-header>
<div class="header-inner">
<h1>${esc(index.marketplace ?? MARKETPLACE)}</h1>
<p class="tagline">Find a plugin, skill, agent, command, hook or MCP server, then copy the install steps.</p>
<form id="search-form" class="search-form" role="search" hidden>
<label for="q">${SEARCH_LABEL}</label>
<input id="q" name="q" type="search" maxlength="200" autocomplete="off" spellcheck="false">
</form>
</div>
</header>
<main id="main">
<p id="status" role="status"></p>
<p id="result-count" class="result-count" role="status" aria-live="polite" aria-atomic="true"></p>
<p id="copy-status" class="copy-status" role="status" aria-live="polite"></p>
<section id="catalog" aria-labelledby="catalog-title">
<h2 id="catalog-title">Plugins <span class="count">${esc(count)}</span></h2>
<ul id="static-list" class="cards" data-fx-cards>
${plugins.map(pluginCard).join('\n')}
</ul>
<div id="app" data-index-url="${esc(assets.indexUrl)}" data-repo="${esc(REPO)}"></div>
</section>
<section id="builder" class="builder" aria-labelledby="builder-title" hidden>
<h2 id="builder-title">Install builder</h2>
</section>
</main>
<footer class="site-footer">
<p>Effects by shaders (MIT)</p>
</footer>
${js}
</body>
</html>
`;
}
