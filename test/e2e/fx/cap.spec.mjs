// AC-51: at most 2 live canvases (the header and one card) at any time.
import { test, expect } from '@playwright/test';
import { stubWebGpu } from '../helpers/fx-stubs.mjs';
import { startServer, injectCards, cardLocator, headerLocator, liveCanvases } from './fx-helpers.mjs';

let server;
test.beforeAll(async () => { server = await startServer(); });
test.afterAll(async () => { await server.close(); });

test('AC-51: focusing ten cards in turn never shows more than 2 canvases', async ({ page }) => {
  await stubWebGpu(page, true);
  await page.goto(server.url);
  await expect(headerLocator(page)).toHaveAttribute('data-fx-state', 'on');
  await injectCards(page, 10);
  let max = 0;
  for (let i = 0; i < 10; i += 1) {
    await cardLocator(page, i).locator('button').focus();
    await expect(cardLocator(page, i)).toHaveAttribute('data-fx-state', 'on');
    max = Math.max(max, await liveCanvases(page).count());
  }
  expect(max).toBeLessThanOrEqual(2);
  await expect(liveCanvases(page)).toHaveCount(2);
});

test('AC-51: moving the pointer across ten cards keeps at most one card canvas', async ({ page }) => {
  await stubWebGpu(page, true);
  await page.goto(server.url);
  await expect(headerLocator(page)).toHaveAttribute('data-fx-state', 'on');
  await injectCards(page, 10);
  for (let i = 0; i < 10; i += 1) {
    await cardLocator(page, i).hover();
    expect(await liveCanvases(page).count()).toBeLessThanOrEqual(2);
    expect(await page.locator('[data-fx-cards] canvas[data-fx-canvas]').count()).toBeLessThanOrEqual(1);
  }
});
