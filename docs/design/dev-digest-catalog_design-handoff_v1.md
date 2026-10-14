# Dev Digest catalog restyle: design hand-off v1

The hi-fi design lives on the Design canvas "Dev Digest catalog — hi-fi" (every screen from section 6 of the brief, light and dark, 1280 / 375 / 320). This file is the engineering side: what to change, in which order, and what is still open.

## Direction

A calm, docs-grade catalog. One surface moves (the header noise, barely noticeable) and one card at a time glows in its type colour on hover or keyboard focus. System fonts, no downloads, no inline styles, no new dependencies.

## Answers to the four designer questions

**Install builder placement.** At 1024 px and up it is a sticky right rail ("Install set", 352 px) next to the results, always present. Below 1024 a tray is docked to the bottom of the viewport with the count and a "Review" button; it opens the same `#builder` as a bottom sheet. Plugin cards also get an "In install set" checkbox.

**Skill → plugin link.** Every non-plugin card ends with an "Installs with beta 1.0.0" chip linking to `#plugin-beta`. Artifact names are set in mono; plugin cards in sans with a contents line, so the two differ before you read the badge.

**Trust and cost.** One inline `<details class="trust-cost">` per plugin card, facts on the closed line. Opening it makes the card span the row (`.card:has(.trust-cost[open])`), with `grid-auto-flow: row dense` so no hole is left. No popover (clips at 320) and no side sheet (competes with the builder rail).

**Columns.** Two at 1280 because the rail takes the third. Free-text search switches the grid to list rows (`.is-list`); the empty query and pure type listings stay a grid.

## Files

`dev-digest-catalog_tokens_v1.css` drops into `site-src/styles/tokens.css`. Existing token names keep their meaning; new ones are `--surface-2`, `--code-bg`, `--border-strong`, `--focus-on-header`, `--header-mid`, `--header-text-muted`, `--header-scrim`, `--header-chip`, `--search-bg`, `--search-border`, `--badge-tint`, `--glow-strength`, `--shadow-1/2`, the font, type-scale, space, radius and motion scales, `--rail-w` and `--content-max`. The light `--type-command` moved from #b45309 to #a84d08 so its badge clears 4.5:1 on its tint.

`dev-digest-catalog_components_v1.css` holds the per-class rules for the names in section 9, with media queries at 640 and 1024. `.site` stands for the page root. Canvas-only simulation classes (`.is-focus`, `.is-glow`, `.is-rim`, `.is-open`) are aliases you can delete.

## Contrast

Every text pair passes 4.5:1 in both themes, including text over the header scrim sampled at the three noise stops and the static gradient midpoint. The lowest is 4.8 (light MCP badge on its tint); the full table is on the Tokens artboard. The guarantee holds only if the header shader clamps its output to the from → mid → to ramp.

## Markup changes to plan

1. Header layers: `canvas[data-fx-canvas]`, `.header-scrim`, `.header-inner`; add `.add-cmd`, search icon, `.search-clear`, `.kbd`, `.search-hint`, `.load-progress`.
2. `.layout` wrapper with `<main class="results">` then `<aside class="builder" id="builder">`, so the builder moves up from the bottom of the page and Tab order stays results → builder.
3. Phone/tablet `.builder-tray` with `aria-controls="builder"`; the builder opens as a modal sheet (`data-open`, focus in, Esc and close return focus, page behind `inert`).
4. `.results-head` merges the h2 and the live status; `.interpretation` sits under it; filter pills get a legend, `.filter-count` and `.filter-from`.
5. Cards: `.badge-shape`, plugin `id`, `.contents`, `.requires`, `.add-set`; artifact `.owner` chip; `.copy-status` live region and `.copy-fallback` textarea.
6. Trust and cost merge into one `<details>` with `.trust-body`, rows and neutral `.flag`s.
7. `.is-list` on the grid when the query has free-text terms.
8. Shared state pieces (`.state-icon`, `.state-actions`, `.index-loading`) and a server-rendered `.static-list` that stays visible under loading, error and no-JS.
9. The card shader follows `:focus-within` as well as `:hover` (focusin/focusout on `[data-fx-cards]`).

New JS is small (tray/sheet toggle, add-set wiring, copy fallback, focus tracking for the glow), comfortably inside the 60 KB budget.

## Open items

The cost method sentence is a placeholder, `[ESTIMATOR]`; it needs the estimator the build actually uses. Artifact names and descriptions for alpha, gamma and delta are stand-ins because I didn't have the fixture text; beta's details and the real catalog copy come from the brief and the live site. The header shader numbers (about 40 s per drift, two-octave simplex) are a target feel, to be tuned on a real screen.
