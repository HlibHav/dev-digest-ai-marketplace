import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { wcagRatio } from '../../helpers/contrast.mjs';
import { TYPES } from '../../../site-src/contract/index-contract.js';
import { TYPE_COLORS, PAGE_BG, CARD_BG } from '../../../site-src/app/type-colors.js';

const tokens = readFileSync(new URL('../../../site-src/styles/tokens.css', import.meta.url), 'utf8');
const THEMES = ['light', 'dark'];

test('AC-58: every type has light and dark text, border, glow and effect colours', () => {
  assert.deepEqual(Object.keys(TYPE_COLORS).sort(), [...TYPES].sort());
  for (const type of TYPES) {
    for (const theme of THEMES) {
      for (const k of ['text', 'border', 'glow', 'effect']) {
        assert.match(TYPE_COLORS[type][theme][k], /^#[0-9a-f]{6}$/i, `${type}.${theme}.${k}`);
      }
    }
  }
});

test('AC-58: badge text reaches 4.5:1 for 6 types x 2 themes x 2 backgrounds', () => {
  let checked = 0;
  for (const type of TYPES) {
    for (const theme of THEMES) {
      for (const [name, bg] of [['page', PAGE_BG[theme]], ['card', CARD_BG[theme]]]) {
        const ratio = wcagRatio(TYPE_COLORS[type][theme].text, bg);
        assert.ok(ratio >= 4.5, `${type}/${theme} on ${name} ${bg}: ${ratio.toFixed(2)}`);
        checked += 1;
      }
    }
  }
  assert.equal(checked, 24);
});

test('AC-58: the six types stay distinct within a theme', () => {
  for (const theme of THEMES) {
    const set = new Set(TYPES.map((t) => TYPE_COLORS[t][theme].text.toLowerCase()));
    assert.equal(set.size, TYPES.length);
  }
});

test('tokens.css carries the same hex values as TYPE_COLORS', () => {
  const lower = tokens.toLowerCase();
  for (const type of TYPES) {
    for (const theme of THEMES) {
      const c = TYPE_COLORS[type][theme];
      assert.ok(lower.includes(c.text.toLowerCase()), `${type}/${theme} text ${c.text}`);
      assert.ok(lower.includes(c.effect.toLowerCase()), `${type}/${theme} effect ${c.effect}`);
    }
  }
  for (const theme of THEMES) {
    assert.ok(lower.includes(PAGE_BG[theme].toLowerCase()));
    assert.ok(lower.includes(CARD_BG[theme].toLowerCase()));
  }
});

test('tokens.css sets --type-color per [data-type] and switches with prefers-color-scheme', () => {
  assert.match(tokens, /prefers-color-scheme:\s*dark/);
  for (const type of TYPES) {
    assert.match(tokens, new RegExp(`\\[data-type="${type}"\\]`), type);
  }
  assert.match(tokens, /--type-color:/);
});

// The badge background is color-mix(in srgb, <type> N%, <card>): a linear mix of the encoded channels.
function mixHex(top, bottom, pct) {
  const ch = (hex, i) => Number.parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
  const out = [0, 1, 2].map((i) => Math.round((ch(top, i) * pct) / 100 + (ch(bottom, i) * (100 - pct)) / 100));
  return `#${out.map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

test('badge text reaches 4.5:1 on its own tint (6 types x 2 themes)', () => {
  const light = tokens.match(/--badge-tint:\s*(\d+)%/);
  const dark = tokens.match(/prefers-color-scheme:\s*dark[\s\S]*?--badge-tint:\s*(\d+)%/);
  assert.ok(light && dark, '--badge-tint missing in tokens.css');
  const tint = { light: Number(light[1]), dark: Number(dark[1]) };
  for (const type of TYPES) {
    for (const theme of THEMES) {
      const text = TYPE_COLORS[type][theme].text;
      const bg = mixHex(text, CARD_BG[theme], tint[theme]);
      const ratio = wcagRatio(text, bg);
      assert.ok(ratio >= 4.5, `${type}/${theme} on tint ${bg}: ${ratio.toFixed(2)}`);
    }
  }
});

test('the design values for the light command colour and page backgrounds are in place', () => {
  assert.equal(TYPE_COLORS.command.light.text, '#a84d08');
  assert.equal(PAGE_BG.light, '#f6f7f9');
  assert.equal(PAGE_BG.dark, '#0f1115');
});
