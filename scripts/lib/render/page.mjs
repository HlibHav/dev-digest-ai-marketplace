// Static page renderer. Everything that comes from the index is escaped; the plugin list is readable without JavaScript.
import { MARKETPLACE, REPO } from '../../../site-src/contract/index-contract.js';
import { t } from '../../../site-src/i18n/t.js';
import { compatibilityText, whatsNew } from '../../../site-src/app/plugin-facts.js';

// Icon glyph, not a translatable word.
const SYMBOL_CLEAR = '×';
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

function dependencies(deps) {
  if (!deps.length) return `<p class="deps">${esc(t('card.noDependencies'))}</p>`;
  const items = deps.map((d) => `<li><code>${esc(d.name)}</code> <span class="range">${esc(d.range)}</span></li>`);
  return `<div class="deps"><p class="deps-title">${esc(t('card.dependsOn'))}</p><ul class="deps-list">${items.join('')}</ul></div>`;
}

function facts(plugin) {
  const compat = compatibilityText(plugin);
  const news = whatsNew(plugin);
  return [
    compat ? `<p class="requires compat">${esc(compat)}</p>` : '',
    news ? `<p class="whats-new"><b>${esc(news.title)}</b>${news.note ? ` ${esc(news.note)}` : ''}</p>` : '',
  ].join('');
}

function pluginCard(plugin) {
  const install = esc((plugin.install_commands ?? []).join('\n'));
  return [
    `<li class="static-item" data-card data-type="plugin" data-plugin="${esc(plugin.name)}">`,
    '<div class="card-head">',
    `<span class="badge"><span class="badge-shape"></span>${esc(t('type.plugin'))}</span>`,
    `<h3 class="card-title">${esc(plugin.name)}</h3>`,
    `<span class="version">${esc(t('card.version', { version: plugin.version }))}</span>`,
    '</div>',
    `<p class="card-desc">${esc(plugin.description)}</p>`,
    `<p class="meta">${esc(t('card.category'))} <span class="category">${esc(plugin.category)}</span></p>`,
    facts(plugin),
    dependencies(plugin.dependencies ?? []),
    `<pre class="install static-cmd"><code>${install}</code></pre>`,
    '</li>',
  ].join('');
}

/** renderPage({index, assets: {css[], js[], indexUrl}, csp}) -> HTML string. All URLs stay as given (relative). */
export function renderPage({ index, assets, csp }) {
  const plugins = index.plugins ?? [];
  const css = (assets.css ?? []).map((href) => `<link rel="stylesheet" href="${esc(href)}">`).join('\n');
  const js = (assets.js ?? []).map((src) => `<script type="module" src="${esc(src)}"></script>`).join('\n');
  const count = t('catalog.count', { count: plugins.length });
  const marketplace = index.marketplace ?? MARKETPLACE;
  return `<!doctype html>
<html lang="${esc(t('meta.lang'))}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${esc(csp)}">
<title>${esc(t('meta.title', { name: marketplace }))}</title>
<meta name="description" content="${esc(t('meta.description', { name: marketplace }))}">
${css}
</head>
<body>
<header id="site-header" class="site-header" data-fx-header>
<div class="header-scrim"></div>
<div class="header-inner">
<div class="header-top">
<div>
<h1 class="site-title">${esc(marketplace)}</h1>
<p class="site-sub tagline">${esc(t('header.tagline'))}</p>
</div>
<div class="add-cmd">
<span class="add-cmd-label">${esc(t('header.addMarketplace'))}</span>
<code>/plugin marketplace add ${esc(REPO)}</code>
<button type="button" class="copy-btn" id="add-cmd-copy" data-copy="marketplace" aria-label="${esc(t('header.copyMarketplaceAria'))}" hidden>${esc(t('header.copy'))}</button>
</div>
</div>
<form id="search-form" class="search" role="search" hidden>
<label for="q">${esc(t('search.label'))}</label>
<div class="search-field">
<svg class="search-icon" aria-hidden="true" focusable="false" viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="8.5" cy="8.5" r="5.75"/><path d="M12.75 12.75 17 17"/></svg>
<input id="q" class="search-input" name="q" type="search" maxlength="200" autocomplete="off" spellcheck="false">
<button type="button" class="search-clear" id="search-clear" aria-label="${esc(t('search.clearAria'))}" hidden>${SYMBOL_CLEAR}</button>
<kbd class="kbd" aria-hidden="true">/</kbd>
</div>
<p class="search-hint">${esc(t('search.hint'))}</p>
</form>
</div>
<div class="load-progress" id="load-progress" hidden></div>
</header>
<div class="layout">
<main id="main" class="results">
<div class="results-head">
<h2 id="catalog-title" class="catalog-title">${esc(t('catalog.title'))} <span class="count">${esc(count)}</span></h2>
<p id="result-count" class="status" role="status" aria-live="polite" aria-atomic="true"></p>
</div>
<p id="status" role="status"></p>
<ul id="static-list" class="static-list" data-fx-cards>
${plugins.map(pluginCard).join('\n')}
</ul>
<div id="app" data-index-url="${esc(assets.indexUrl)}" data-repo="${esc(REPO)}"></div>
</main>
<aside class="builder" id="builder" aria-labelledby="builder-title" hidden>
<div class="builder-head">
<h2 class="builder-title" id="builder-title">${esc(t('builder.title'))}</h2>
<span class="builder-count" id="builder-count"></span>
</div>
</aside>
</div>
<footer class="site-footer">
<div class="footer-inner">
<span>${esc(t('footer.note'))}</span>
<a href="licenses.txt">${esc(t('footer.licences'))}</a>
</div>
</footer>
<section class="builder-tray" id="builder-tray" aria-label="${esc(t('tray.sectionAria'))}" hidden>
<div class="tray-text"><b>${esc(t('builder.title'))}</b><span id="tray-summary">${esc(t('tray.none'))}</span></div>
<button type="button" class="btn btn-primary" id="tray-open" aria-controls="builder" aria-expanded="false">${esc(t('tray.review'))}</button>
</section>
<p id="copy-status" class="copy-status" role="status" aria-live="polite"></p>
${js}
</body>
</html>
`;
}
