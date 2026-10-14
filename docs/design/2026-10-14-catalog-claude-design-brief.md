# Claude Design brief: dev-digest-ai-marketplace catalog

Date: 2026-10-14. Owner: Glib. Feature spec: [SPEC-2026-10-14-catalog-search](../../specs/SPEC-2026-10-14-catalog-search.md).
Built implementation: PR #3 (`feat/catalog-search`). This brief asks for a visual design of a page that
already works, so every screen below has real behaviour and real data behind it.

## 1. What we want from Claude Design

A hi-fi design for the catalog site at `https://hlibhav.github.io/dev-digest-ai-marketplace/`, delivered
as artboards on one canvas, light and dark, desktop (1280) and phone (375, plus a 320 check), for the
screens in section 6. Then a hand-off: token values and per-component styles that map onto the existing
CSS variables and class names (section 9), so an engineer can restyle without touching behaviour.

The look we are after: a developer tool that feels alive. Calm, dense, readable like a good docs site,
with one place of motion (the header shader) and one moment of delight (the glow on the card you hover
or focus). Not a marketing landing page, not a dashboard.

## 2. Product in one paragraph

A static catalog of Claude Code plugins. People search it in Ukrainian or English ("мені треба скіл для
рев'ю архітектури"), get cards for plugins and the things inside them (skills, agents, commands, hooks,
MCP servers), see what a plugin will run on their machine and roughly what it costs in context, then
copy install commands or a ready `.claude/settings.json` for their team. No backend, no accounts.

Users:
- a Claude Code user, often Ukrainian-speaking, looking for a capability and wanting to install it safely;
- a team lead assembling a settings file for a project;
- a plugin author checking how their plugin reads in the catalog.

## 3. Hard constraints (the design must fit these)

- **Static site, same origin only.** No web fonts or images from other hosts. Use a system font stack
  (`system-ui`, `ui-monospace`) or propose a font we would self-host, with its licence.
- **CSP forbids inline styles and inline scripts.** Everything is classes plus CSS variables.
- **Contrast at least 4.5:1** for all text in both themes, including text drawn over the header effect.
- **Phone width 320 px** with no horizontal scroll.
- **Keyboard first.** Every control has a visible focus style; a card's glow also appears on keyboard focus.
- **Colour is never the only signal.** A card always shows its type as a text label.
- **Reduced motion** (`prefers-reduced-motion`) and **no WebGPU** both fall back to a static header and a
  non-animated focus style. Design this fallback explicitly, it is what many people will see.
- **At most two live effects** at once: the header and one card.
- **No-JS view.** Without JavaScript the page shows a plain, readable plugin list. Design it too.
- **The trust profile is a description, not a security rating.** No green "safe" or red "danger"
  verdicts, no scores. Flags state facts ("broad hook", "non-loopback server").
- **Cost is an estimate.** Every number carries "about" and the method; avoid a precise-looking gauge.

## 4. What exists today (and what is weak)

The page is one column: a gradient header with title, subtitle and search box; a status line; the
catalog heading with type filter checkboxes; a card grid (1/2/3 columns); the install builder at the
bottom. Screenshots of the current state can be taken from a local build
(`node scripts/build-index.mjs --root test/fixtures/marketplace --out .tmp/demo-site`).

Weak spots we want the design to solve:
- the header is a flat band; the search box has no affordance beyond its label;
- the status line ("1 result") and the catalog heading compete; filters read as a row of raw checkboxes;
- cards for a plugin and for a skill look the same apart from the badge;
- the trust profile and cost open as a long wall of text inside the card and push the grid around;
- the install builder is a plain checklist far below the results; its output blocks look like logs;
- the no-results, loading and error states are a line of text;
- there is no visual link between a result (a skill) and the plugin you actually install.

## 5. Visual language

**Type colours** (current values, contrast-checked; you may tune them if every badge text keeps 4.5:1
against page and card backgrounds in its theme):

| Type | Light | Dark |
|---|---|---|
| plugin | #1d4ed8 | #60a5fa |
| skill | #6d28d9 | #a78bfa |
| agent | #047857 | #34d399 |
| command | #b45309 | #fbbf24 |
| hook | #be123c | #fb7185 |
| MCP server | #0e7490 | #22d3ee |

Hooks use rose and MCP uses cyan only as identity colours. Do not let rose read as "danger" in the trust
profile; flags need their own neutral treatment.

**Effects** (our own WebGPU shaders, about 4 KB):
- Header: a slow noise gradient between `--header-from` and `--header-to`, rendered behind a scrim so the
  title and search stay readable. Specify the palette, the speed feel (should be barely noticeable) and
  the scrim.
- Card: a soft glow and rim in the card's type colour while hovered or focused.
- Static fallback for both: specify the gradient and the focus outline.

## 6. Screens and states to design

Each in light and dark; desktop 1280 and phone 375 unless noted.

1. **Full catalog** (empty query): header, filters, all cards. 23 entries in the demo data.
2. **Search results** for "мені треба скіл для рев'ю архітектури": one skill card `/beta:review`, matched
   words "Architecture" and "review" highlighted, and a line showing how the query was read
   (type: skill; terms: review, architecture).
3. **Type listing**: query "агенти" lists all agents.
4. **No results**: "skill zzzzqq", restating the interpretation, with "Clear the type filter".
5. **Loading** the index (the static list stays visible underneath).
6. **Index failed to load**: error with Retry, static list still visible.
7. **Card hover and keyboard focus** with the glow, one per type (six variants on one artboard).
8. **Plugin card with trust profile and cost open** (`beta`): 2 hooks (`PreToolUse` broad, `SessionStart`),
   2 MCP servers (`stdio-tool` local command; `remote-docs` at `https://example.com/mcp`, non-loopback),
   a `scripts/` folder, cost "about 60 tokens always loaded, about 95 on invocation". Also the empty
   profile ("declares no hooks, MCP servers or scripts") for `epsilon`.
9. **Install builder**: `suite` selected; `alpha`, `beta`, `delta` and `gamma` added automatically with
   "required by …" and ranges like `~1.0.0`; the note that ranges resolve against release tags; the CLI
   commands block and the `settings.json` block, each with Copy. Also the empty builder.
10. **Copy feedback**: "Copied" confirmation, and the manual-copy fallback when the clipboard is blocked.
11. **No-JS page**: the plain plugin list.
12. **Reduced motion / no WebGPU**: header and focused card in their static form.
13. **Phone 320**: results and the builder, to prove nothing overflows.

Placement is open: the builder may become a side panel, a drawer or a sticky tray, as long as it stays
keyboard reachable and works at 320 px. Say where it lives on phone.

## 7. Content model (real data to use)

Card fields: type label, namespaced name (`/beta:review`, `beta:architect`, `/beta:ops:deploy`,
`beta/PreToolUse#0`, `beta/remote-docs`), owning plugin, description (may be long), version (plugins),
category, matched-word highlights, Copy install (copies two lines:
`/plugin marketplace add HlibHav/dev-digest-ai-marketplace` and `/plugin install <plugin>@dev-digest-ai-marketplace`).

Demo plugins: `alpha` (one of everything), `beta` (review tooling, depends on alpha and gamma),
`gamma` (depends on delta), `delta` (description contains markup, rendered as text), `epsilon` (empty),
`suite` (bundle of alpha, beta, delta). Real catalog: `engineering-paved-path`, `research-tools`,
`architecture-review`, `sdd-engineering` (depends on the other three), all at 0.1.0 and still empty.

Design for long names, long descriptions, a plugin with zero artifacts and a catalog of a few hundred
entries (results cap at 100 cards with "Show N more").

## 8. Components inventory

Header with search · search box with clear button · query interpretation line · result count (live
region) · type filter group · card (plugin variant, artifact variant) · type badge · version and
category meta · highlight mark · Copy button and its confirmation · trust profile disclosure (notice,
summary sentence, hook rows, MCP rows, flags, URL list as plain text) · cost block (two estimates,
method note) · "Show N more" · no-results box · loading state · error with Retry · builder (rows,
auto-added note, locked state, ranges note, two output blocks with Copy, empty guidance) · footer.

## 9. Engineering contract (keep these names)

The design hands off as values and rules for what already exists, not a new component tree.

- **Tokens** in `site-src/styles/tokens.css`: `--page-bg`, `--card-bg`, `--text`, `--text-muted`, `--border`,
  `--focus`, `--type-plugin|skill|agent|command|hook|mcp_server`, `--header-from`, `--header-to`,
  `--header-text`, `--mark-bg`, `--mark-text`. New tokens are welcome (spacing, radius, type scale,
  elevation); name them.
- **DOM hooks the effects rely on**: `#site-header[data-fx-header]`, `[data-fx-cards]`,
  `[data-card][data-type]`, `canvas[data-fx-canvas]`, `data-fx-state="on|off|static"`, `--type-color`.
- **Class names in use**: `card`, `card-head`, `card-title`, `card-desc`, `card-actions`, `badge`, `meta`,
  `version`, `category`, `owner`, `plugin-name`, `install`, `copy-btn`, `filters`, `filter`,
  `interpretation`, `no-results`, `no-results-title`, `clear-filter`, `load-error`, `retry`, `more`,
  `show-more`, `trust-cost`, `trust-title`, `trust-notice`, `trust-sentence`, `trust-urls`, `cost-title`,
  `cost-notice`, `builder-intro`, `builder-list`, `builder-row`, `row-note`, `builder-set`, `range-note`,
  `builder-output`, `builder-guidance`.
- Layout changes that need new markup (for example moving the builder into a drawer) are fine: list them
  as a separate change so we can plan the code.
- Budgets: core JS stays under 60 KB gzipped; CSS has no hard budget but keep it lean.

## 10. Out of scope

Logo and brand identity beyond the header treatment, marketing copy, a per-artifact detail page,
a dependency graph view, version history, analytics. The existing "Super Supervision" design system is
a different brand; do not apply it unless Glib asks.

## 11. Acceptance for the design

- Every screen in section 6 exists in light and dark; phone variants where listed.
- A contrast table for text, badges and text over the header scrim in both themes, all at 4.5:1 or more.
- Focus styles shown for search, filters, cards, Copy, builder checkboxes and Retry.
- Static fallbacks for header and card drawn, not implied.
- Trust profile uses neutral flags; no safety verdicts.
- Hand-off lists token values and per-class rules keyed to section 9, plus any markup changes.

## 12. Questions for the designer to answer

1. Where does the install builder live on desktop and on phone?
2. How does a skill card point to the plugin you install (a chip, a breadcrumb, a nested look)?
3. Should the trust and cost details open inline, in a popover or in a side sheet, given they are long?
4. Do we keep three columns at 1280, or switch to a list with richer rows for search results?
