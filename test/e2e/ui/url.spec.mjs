// AC-22 and AC-23: the query and filters live in the URL and are restored from it.
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

const titles = (page) => page.locator('#app [data-card] .card-title').allTextContents();

test('AC-22: a copied URL restores the same input and results in a fresh page', async ({ page, context }) => {
  await page.goto(server.url);
  await page.locator('#q').fill('architecture');
  await page.locator('#app input[name="type"][value="skill"]').check();
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('architecture');
  expect(new URL(page.url()).searchParams.getAll('type')).toEqual(['skill']);
  const before = await titles(page);
  expect(before.length).toBeGreaterThan(0);

  const fresh = await context.newPage();
  await fresh.goto(page.url());
  await expect(fresh.locator('#search-form')).toBeVisible();
  await expect(fresh.locator('#q')).toHaveValue('architecture');
  await expect(fresh.locator('#app input[name="type"][value="skill"]')).toBeChecked();
  expect(await titles(fresh)).toEqual(before);
});

test('clearing the query removes it from the URL', async ({ page }) => {
  await page.goto(`${server.url}/?q=lookup`);
  await expect(page.locator('#q')).toHaveValue('lookup');
  await page.locator('#q').fill('');
  await expect.poll(() => new URL(page.url()).search).toBe('');
});

test('AC-23: a 10 000 character query is cut to 200 and the page still works', async ({ page }) => {
  await page.goto(`${server.url}/?q=${'a'.repeat(10000)}`);
  await expect(page.locator('#search-form')).toBeVisible();
  const value = await page.locator('#q').inputValue();
  expect(value.length).toBe(200);
  await expect(page.locator('#result-count')).not.toBeEmpty();
});

test('unknown types and unknown plugins in the URL are ignored', async ({ page }) => {
  await page.goto(`${server.url}/?q=lookup&type=foo&plugins=nope`);
  await expect(page.locator('#app [data-card][data-type="skill"]').filter({ hasText: '/alpha:lookup' })).toBeVisible();
  await expect(page.locator('#app input[name="type"]:checked')).toHaveCount(0);
  await expect(page.locator('#builder input:checked')).toHaveCount(0);
});
