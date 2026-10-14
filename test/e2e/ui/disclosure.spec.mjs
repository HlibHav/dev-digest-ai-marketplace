// AC-60: a trust-and-cost disclosure opens in place. The card keeps its grid cell, so nothing jumps.
import { test, expect } from '@playwright/test';
import { serve } from '../helpers/serve.mjs';
import { buildFixtureSite } from '../helpers/build-fixture-site.mjs';

let server;

test.beforeAll(async () => {
  server = await serve(buildFixtureSite());
});

test.afterAll(async () => {
  await server.close();
});

test.use({ viewport: { width: 1280, height: 900 } });

const corner = async (card) => {
  const { x, y } = await card.boundingBox();
  return { x, y };
};

test('AC-60: opening a disclosure keeps the card, its row neighbour and the scroll position where they were', async ({ page }) => {
  await page.goto(server.url);
  await page.locator('#app input[name="type"][value="plugin"]').check();
  const cards = page.locator('#app [data-card][data-type="plugin"]');
  const first = cards.nth(0);
  const second = cards.nth(1);
  await expect(second).toBeVisible();

  const before = { first: await corner(first), second: await corner(second), scroll: await page.evaluate(() => window.scrollY) };
  // the two cards share a row, which is what the old full-row span used to break
  expect(Math.abs(before.first.y - before.second.y)).toBeLessThanOrEqual(1);
  expect(before.second.x).toBeGreaterThan(before.first.x + 100);

  const near = (actual, expected) => {
    expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(1);
  };

  await first.locator('summary').click();
  await expect(first.locator('details')).toHaveAttribute('open', '');
  near(await corner(first), before.first);
  near(await corner(second), before.second);

  await second.locator('summary').click();
  await expect(second.locator('details')).toHaveAttribute('open', '');
  near(await corner(first), before.first);
  near(await corner(second), before.second);
  expect(await page.evaluate(() => window.scrollY)).toBe(before.scroll);
});
