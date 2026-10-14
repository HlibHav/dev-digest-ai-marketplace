// AC-50: hover and keyboard focus switch a card effect on, leaving switches it off, colour is fixed per type.
import { test, expect } from '@playwright/test';
import { stubWebGpu } from '../helpers/fx-stubs.mjs';
import { startServer, injectCards, cardLocator, headerLocator, TYPES } from './fx-helpers.mjs';

let server;
test.beforeAll(async () => { server = await startServer(); });
test.afterAll(async () => { await server.close(); });

test.beforeEach(async ({ page }) => {
  await stubWebGpu(page, true);
  await page.goto(server.url);
  await expect(headerLocator(page)).toHaveAttribute('data-fx-state', 'on');
  await injectCards(page, 6);
});

test('AC-50: hover turns the card effect on, moving away turns it off', async ({ page }) => {
  const card = cardLocator(page, 1);
  await card.hover();
  await expect(card).toHaveAttribute('data-fx-state', 'on');
  await expect(card.locator('canvas[data-fx-canvas]')).toHaveCount(1);
  await page.mouse.move(0, 0);
  await expect(card).toHaveAttribute('data-fx-state', 'off');
  await expect(card.locator('canvas[data-fx-canvas]')).toHaveCount(0);
});

test('AC-50: keyboard focus turns the card effect on, blur turns it off', async ({ page }) => {
  const card = cardLocator(page, 2);
  await card.locator('button').focus();
  await expect(card).toHaveAttribute('data-fx-state', 'on');
  await card.locator('button').blur();
  await expect(card).toHaveAttribute('data-fx-state', 'off');
});

test('AC-50: the effect colour is the card type colour and differs for all six types', async ({ page }) => {
  const seen = new Map();
  for (let i = 0; i < TYPES.length; i += 1) {
    const card = cardLocator(page, i);
    await card.hover();
    const canvas = card.locator('canvas[data-fx-canvas]');
    await expect(canvas).toHaveCount(1);
    const fx = await canvas.getAttribute('data-fx-color');
    const css = await card.evaluate((el) => getComputedStyle(el).getPropertyValue('--type-color').trim());
    expect(fx.toLowerCase()).toBe(css.toLowerCase());
    seen.set(TYPES[i], fx);
  }
  expect(new Set(seen.values()).size).toBe(6);
});
