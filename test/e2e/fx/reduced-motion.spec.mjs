// AC-53: with reduced motion nothing animates; focus is shown by an outline.
import { test, expect } from '@playwright/test';
import { stubWebGpu } from '../helpers/fx-stubs.mjs';
import { startServer, injectCards, cardLocator, headerLocator, liveCanvases } from './fx-helpers.mjs';

let server;
test.beforeAll(async () => { server = await startServer(); });
test.afterAll(async () => { await server.close(); });

test.use({ reducedMotion: 'reduce' });

test('AC-53: reduced motion leaves the header static and creates no canvas', async ({ page }) => {
  await stubWebGpu(page, true);
  await page.goto(server.url);
  await expect(headerLocator(page)).toHaveAttribute('data-fx-state', 'static');
  await expect(liveCanvases(page)).toHaveCount(0);
});

test('AC-53: hover and focus on a card add no canvas, and focus shows an outline', async ({ page }) => {
  await stubWebGpu(page, true);
  await page.goto(server.url);
  await expect(headerLocator(page)).toHaveAttribute('data-fx-state', 'static');
  await injectCards(page, 3);
  const card = cardLocator(page, 1);
  await card.hover();
  await card.locator('button').focus();
  await page.waitForTimeout(300);
  await expect(liveCanvases(page)).toHaveCount(0);
  const outline = await card.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe('none');
});
