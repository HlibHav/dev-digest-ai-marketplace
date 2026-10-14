// AC-24: index text and the URL query are data. Nothing becomes markup or script.
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

test('a description with script and img markup appears literally', async ({ page }) => {
  await page.goto(server.url);
  await page.locator('#q').fill('inject');
  await expect(page.locator('#result-count')).toHaveText(/^\d+ results?$/);
  const card = page.locator('#app [data-card][data-type="skill"]').filter({ hasText: '/delta:inject' });
  await expect(card).toBeVisible();
  await expect(card.locator('.card-desc')).toContainText('<script>window.__x=1</script>');
  await expect(card.locator('.card-desc')).toContainText('<img src=x onerror=window.__x=2>');
  expect(await page.evaluate(() => window.__x)).toBeUndefined();
  await expect(page.locator('#app script')).toHaveCount(0);
  await expect(page.locator('#app img')).toHaveCount(0);
});

test('markup in the URL query is shown as text and never runs', async ({ page }) => {
  const q = '<script>window.__x=1</script><img src=x onerror=window.__x=2>';
  await page.goto(`${server.url}/?q=${encodeURIComponent(q)}`);
  await expect(page.locator('#search-form')).toBeVisible();
  await expect(page.locator('#q')).toHaveValue(q);
  expect(await page.evaluate(() => window.__x)).toBeUndefined();
  await expect(page.locator('#app script')).toHaveCount(0);
  await expect(page.locator('#app img')).toHaveCount(0);
  await expect(page.locator('img')).toHaveCount(0);
});

test('regular expression characters in the query are plain text', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(server.url);
  for (const q of ['(', '[a-', '.*', '\\', 'a{2,1}']) {
    await page.locator('#q').fill(q);
    await expect(page.locator('#result-count')).not.toBeEmpty();
  }
  expect(errors).toEqual([]);
});
