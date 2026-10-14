// AC-44: a loading state while the index loads; on failure the static list stays, with an error and a retry.
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

const INDEX = '**/index.json*';

test('a slow index shows the loading state and keeps the static list visible', async ({ page }) => {
  await page.route(INDEX, async (route) => {
    await new Promise((r) => setTimeout(r, 1200));
    await route.continue();
  });
  await page.goto(server.url, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#status')).toContainText('Loading');
  await expect(page.locator('#static-list')).toBeVisible();
  await expect(page.locator('#search-form')).toBeHidden();
  await expect(page.locator('#search-form')).toBeVisible();
  await expect(page.locator('#static-list')).toBeHidden();
  await expect(page.locator('#status')).toBeEmpty();
});

test('a blocked index keeps the static list, shows an error and a retry that works', async ({ page }) => {
  await page.route(INDEX, (route) => route.abort());
  await page.goto(server.url);
  const error = page.locator('.load-error');
  await expect(error).toBeVisible();
  await expect(error).toContainText('could not be loaded');
  await expect(page.locator('#static-list')).toBeVisible();
  await expect(page.locator('#static-list [data-card]').first()).toBeVisible();
  await expect(page.locator('#search-form')).toBeHidden();

  await page.unroute(INDEX);
  await error.getByRole('button', { name: /Retry/ }).click();
  await expect(page.locator('#search-form')).toBeVisible();
  await expect(page.locator('.load-error')).toHaveCount(0);
  await expect(page.locator('#static-list')).toBeHidden();
});

test('an HTTP error from the index is treated like a failed load', async ({ page }) => {
  await page.route(INDEX, (route) => route.fulfill({ status: 500, body: 'boom' }));
  await page.goto(server.url);
  await expect(page.locator('.load-error')).toBeVisible();
  await expect(page.locator('#static-list')).toBeVisible();
});

test('an index that is not valid JSON is treated like a failed load', async ({ page }) => {
  await page.route(INDEX, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{not json' }));
  await page.goto(server.url);
  await expect(page.locator('.load-error')).toBeVisible();
  await expect(page.locator('#static-list')).toBeVisible();
});
