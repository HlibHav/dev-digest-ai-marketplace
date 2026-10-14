# Catalog contracts

Shared shapes between the build (`scripts/`), the browser code (`site-src/`) and the tests.
The source of truth for behaviour is `specs/SPEC-2026-10-14-catalog-search.md`. The executable
form of the index contract is `site-src/contract/index-contract.js`.

## Index (`site/index.json`)

Compact JSON with a trailing newline. The index is an object, not a bare array.

```
{ schema_version, marketplace, plugins[], artifacts[] }
```

- `schema_version`: `1`. `marketplace`: `dev-digest-ai-marketplace`.
- `plugins[]` keeps catalog order. Each entry:
  `{ name, version, description, category, tags[], dependencies: [{name, range}], install_commands[], compatibility, changelog[], trust, cost }`
  - `dependencies[].range` is a `^` or `~` range. plugin.json may spell a dependency as `{ "name", "version" }` or as `"name@marketplace@^x.y.z"`; both normalise to `{name, range}`. `check-repo` additionally requires the object form and a `^` range, because Claude Code ignores the range in the string form.
  - `compatibility`: `{ claudeCode: ">=x.y.z" }` or `null`. Read from the first `Claude Code >=x.y.z` line of the plugin's `COMPATIBILITY.md` (backticks and spaces allowed); `null` when the file or the line is absent.
  - `changelog`: `Array<{ version, date: string|null, notes: string }>`, newest first (file order), `[]` when `CHANGELOG.md` is absent. A heading is `## x.y.z`, optionally followed by ` — YYYY-MM-DD`, ` - YYYY-MM-DD` or ` (YYYY-MM-DD)`. `notes` is the bullet lines under the heading with markdown markers and backticks stripped, joined with `\n` and capped at 600 characters (whole lines first; a single oversized line is cut and ends with `…`).
- `artifacts[]` is sorted by plugin order, then type order (`plugin`, `skill`, `agent`, `command`, `hook`, `mcp_server`), then name. Each entry:
  `{ type, name, plugin, description, body_excerpt, source_path, install_commands[] }`
  - `body_excerpt` is at most 4000 characters; the full body still counts for cost.
  - `install_commands` are the owning plugin's two lines: the marketplace add command, then the install command.
- `trust`:
  `{ hooks: [{event, matcher|null, broad, source_path}], mcp_servers: [{name, transport, command|url, args[], non_loopback, source_path}], has_scripts, network_urls[] }`
  - `transport` is `command` or `url`. A `command` server carries `command`, a `url` server carries `url`.
- `cost`: `{ always_loaded_tokens, on_invocation_tokens, method, excluded[] }`

Constants exported by the contract module: `TYPES`, `SCHEMA_VERSION`, `MARKETPLACE`, `REPO`,
`MAX_EXCERPT` (4000), `MAX_QUERY` (200), and `assertIndexShape(index)`, which throws an `Error`
naming the path and the rule it broke.

## Search API (search core to interactive UI)

- `parseCurated({dictionary, stopUk, stopEn, typewords}) -> Curated`
- `createSearch(index, curated) -> { search(raw) -> Result }`
- `Result = { state: 'empty-query' | 'type-listing' | 'results' | 'no-results', interpretation: {types[], terms[]}, hits: [{doc, score, terms[]}] }`
- `doc = { id, type, name, plugin, description, body, tags[], category }`

`site-src/search` and `site-src/contract` are isomorphic: they import no `node:*` module.

## Effects DOM contract (UI and effects)

- Header: `<header id="site-header" data-fx-header>`.
- Results container: `[data-fx-cards]`. Cards: `[data-card][data-type]`.
- The CSS variable `--type-color` is set per card (`[data-type]` in `site-src/styles/tokens.css`).
- The header effect reads `--header-from`, `--header-mid` and `--header-to` and clamps its output to that ramp, so the text contrast over the scrim holds for every frame.
- A card's glow follows hover and `:focus-within`; the controller listens to `focusin` and `focusout` on the card list.
- Effects write `data-fx-state="on|off|static"` on the header and on the active card, and create `canvas[data-fx-canvas]`.
- The effects entry is `site-src/effects/fx-entry.js`, exporting `startEffects({root, win}) -> Promise<void>`. It never throws to the caller.
- At most 2 live canvases at any time: the header and at most one card.

## Page structure (restyle v1)

`header#site-header` (scrim, `.header-inner`), then `.layout` holding `main.results` and `aside#builder` (so Tab order is results, then builder), then the footer and the `.builder-tray`. At 1024 px and up `#builder` is a sticky rail; below it the tray's "Review" button (`aria-controls="builder"`) opens it as a modal bottom sheet (`data-open`, rest of the page `inert`).

## Page renderer (static render to integration)

`renderPage({index, assets: {css: string[], js: string[], indexUrl: string}, csp: string}) -> string`

All URLs are relative, because Pages serves a project sub-path.

## Test helpers

- `test/helpers/make-marketplace.mjs`: `makeMarketplace(dir, spec) -> dir`
- `test/helpers/run-build.mjs`: `runBuild({root, out, env?, nodeArgs?}) -> {code, stdout, stderr}`
- `test/helpers/contrast.mjs`: `wcagRatio(hexA, hexB) -> number`
- `test/helpers/gen-index.mjs`: `genIndexAtBudget(gzipBytes) -> index`
- `test/helpers/no-network.mjs`: preload module that makes network access throw.
- `test/e2e/helpers/*`: `serve`, `buildFixtureSite`, `netLog`, `stubWebGpu`, `countRaf`, `setHidden`.
- Fixture marketplace: `test/fixtures/marketplace/` (never under `plugins/`).
