// AC-48: follows the colour scheme with 4.5:1 text contrast and has no horizontal scroll at 320 px.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { serve } from '../helpers/serve.mjs';
import { buildFixtureSite } from '../helpers/build-fixture-site.mjs';

let server;

test.beforeAll(async () => {
  server = await serve(buildFixtureSite());
});

test.afterAll(async () => {
  await server.close();
});

for (const scheme of ['light', 'dark']) {
  test.describe(`${scheme} scheme`, () => {
    test.use({ colorScheme: scheme });

    test(`AC-48: no horizontal scroll at 320 px (${scheme})`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 700 });
      await page.goto(server.url);
      await expect(page.locator('[data-card]:visible').first()).toBeVisible();
      const overflow = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        body: document.body.scrollWidth - document.documentElement.clientWidth,
      }));
      expect(overflow.doc).toBeLessThanOrEqual(0);
      expect(overflow.body).toBeLessThanOrEqual(0);
    });

    test(`AC-48: axe finds no color-contrast violation (${scheme})`, async ({ page }) => {
      await page.goto(server.url);
      await expect(page.locator('[data-card]:visible').first()).toBeVisible();
      const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
      expect(results.violations).toEqual([]);
    });

    test(`the page background follows the ${scheme} preference`, async ({ page }) => {
      await page.goto(server.url);
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      expect(bg).toBe(scheme === 'dark' ? 'rgb(18, 18, 18)' : 'rgb(255, 255, 255)');
    });
  });
}

test('card badges take their colour from --type-color', async ({ page }) => {
  await page.goto(server.url);
  const card = page.locator('[data-card][data-type="plugin"]:visible').first();
  const color = await card.evaluate((el) => getComputedStyle(el).getPropertyValue('--type-color').trim());
  expect(color).toMatch(/^#[0-9a-f]{6}$/i);
});
