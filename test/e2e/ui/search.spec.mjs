// AC-11, AC-13, AC-14, AC-18, AC-19, AC-20, AC-47: search, type filters and result cards on the fixture site.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serve } from '../helpers/serve.mjs';
import { buildFixtureSite } from '../helpers/build-fixture-site.mjs';

let server;
let index;

test.beforeAll(async () => {
  const dir = buildFixtureSite();
  index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
  server = await serve(dir);
});

test.afterAll(async () => {
  await server.close();
});

const cards = (page, type) => page.locator(`#app [data-card]${type ? `[data-type="${type}"]` : ''}`);

async function open(page) {
  await page.goto(server.url);
  await expect(page.locator('#search-form')).toBeVisible();
}

// The box is debounced: wait until the full-catalog listing has been replaced by the filtered one.
async function search(page, q) {
  await page.locator('#q').fill(q);
  await expect(page.locator('#result-count')).not.toContainText('full catalog');
}

test('AC-11: one query box returns cards of several types for a shared word', async ({ page }) => {
  await open(page);
  await search(page, 'architecture');
  await expect(cards(page, 'plugin').first()).toBeVisible();
  await expect(cards(page, 'skill').first()).toBeVisible();
  await expect(cards(page, 'agent').first()).toBeVisible();
});

test('AC-18: only stop words show the full catalog, not the no-results message', async ({ page }) => {
  await open(page);
  const expected = index.plugins.length + index.artifacts.filter((a) => a.type !== 'plugin').length;
  await page.locator('#q').fill('для і на');
  await expect(cards(page)).toHaveCount(expected);
  await expect(page.locator('.no-results')).toBeHidden();
  await expect(page.locator('#result-count')).toContainText('full catalog');
});

test('AC-19: zero results restate the interpretation and offer to clear the filter', async ({ page }) => {
  await open(page);
  await search(page, 'skill zzzzqq');
  const box = page.locator('.no-results');
  await expect(box).toBeVisible();
  await expect(box).toContainText('type skill');
  await expect(box).toContainText('zzzzqq');
  await expect(cards(page)).toHaveCount(0);
  await box.getByRole('button', { name: 'Clear the type filter' }).click();
  await expect(box).not.toContainText('type skill');
  await expect(box).toContainText('zzzzqq');
  await expect(page.locator('#q')).toHaveValue('zzzzqq');
  await expect(page.locator('#q')).toBeFocused();
});

test('AC-13, AC-14: a Ukrainian query with a type word filters by type and expands the terms', async ({ page }) => {
  await open(page);
  await search(page, "скіл для рев'ю архітектури");
  await expect(cards(page, 'skill').filter({ hasText: '/beta:review' })).toBeVisible();
  const types = await cards(page).evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-type')))]);
  expect(types).toEqual(['skill']);
});

test('the type checkboxes filter the full catalog', async ({ page }) => {
  await open(page);
  await page.locator('#app input[name="type"][value="agent"]').check();
  const agents = index.artifacts.filter((a) => a.type === 'agent').length;
  await expect(cards(page)).toHaveCount(agents);
  await expect(cards(page, 'agent')).toHaveCount(agents);
});

test('AC-20: a card shows type, name, owner plugin chip, description, highlight and a copy button', async ({ page }) => {
  await open(page);
  await search(page, 'review');
  const card = cards(page, 'skill').filter({ hasText: '/beta:review' });
  await expect(card).toBeVisible();
  await expect(card.locator('.badge')).toHaveText('skill');
  await expect(card.locator('.card-title')).toContainText('/beta:review');
  await expect(card.locator('a.owner')).toHaveText(/^Installs with\s+beta\s+\d+\.\d+\.\d+$/);
  await expect(card.locator('a.owner')).toHaveAttribute('href', '#plugin-beta');
  await expect(card.locator('.card-desc')).toContainText('Architecture review of a diff against layer boundaries');
  expect(await card.locator('mark').count()).toBeGreaterThan(0);
  await expect(card.getByRole('button', { name: /^Copy install/ })).toBeVisible();
  await expect(card).toHaveAttribute('data-plugin', 'beta');
});

test('AC-47: the result count is announced in a polite live region', async ({ page }) => {
  await open(page);
  const region = page.locator('#result-count');
  await expect(region).toHaveAttribute('aria-live', 'polite');
  await search(page, 'lookup');
  await expect(region).toHaveText(/^\d+ results?$/);
  await search(page, 'skill zzzzqq');
  await expect(region).toHaveText('No results');
});

test('AC-26: the static list is replaced by the enhanced view once ready', async ({ page }) => {
  await open(page);
  await expect(page.locator('#static-list')).toBeHidden();
  await expect(cards(page)).not.toHaveCount(0);
});

test('a type with nothing in the catalog is a disabled chip; with a query the counts follow the query', async ({ page }) => {
  // the fixture ships every type, so serve a copy of the index without commands
  await page.route(/index\.json/, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.artifacts = body.artifacts.filter((a) => a.type !== 'command');
    await route.fulfill({ response, json: body });
  });
  await open(page);
  const chip = page.locator('#app input[name="type"][value="command"]');
  await expect(chip).toBeDisabled();
  await expect(chip).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('#app label.filter[data-type="command"]')).toHaveAttribute('title', 'None in this catalog');
  await expect(chip).toHaveAccessibleDescription('None in this catalog');
  await expect(page.locator('#app input[name="type"][value="skill"]')).toBeEnabled();
  // a free-text query counts hits, so a type with none stays a normal chip
  await search(page, 'architecture');
  await expect(chip).toBeEnabled();
  await expect(chip).not.toHaveAttribute('aria-disabled');
});

test('the search hint names the type filter and no longer advertises languages', async ({ page }) => {
  await open(page);
  await expect(page.locator('.search-hint')).toHaveText('Name a type, such as agent or hook, to narrow the list.');
});
