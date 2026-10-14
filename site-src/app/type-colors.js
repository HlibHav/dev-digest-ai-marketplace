// One colour set per artifact type and theme. Badge text is checked against the page and card
// backgrounds by test/unit/app/type-colors.test.mjs (AC-58). styles/tokens.css repeats these hex values.
const pair = (light, dark) => ({
  light: { text: light, border: light, glow: light, effect: light },
  dark: { text: dark, border: dark, glow: dark, effect: dark },
});

export const TYPE_COLORS = Object.freeze({
  plugin: pair('#1d4ed8', '#60a5fa'),
  skill: pair('#6d28d9', '#a78bfa'),
  agent: pair('#047857', '#34d399'),
  command: pair('#a84d08', '#fbbf24'),
  hook: pair('#be123c', '#fb7185'),
  mcp_server: pair('#0e7490', '#22d3ee'),
});

export const PAGE_BG = Object.freeze({ light: '#f6f7f9', dark: '#0f1115' });
export const CARD_BG = Object.freeze({ light: '#ffffff', dark: '#171a21' });
