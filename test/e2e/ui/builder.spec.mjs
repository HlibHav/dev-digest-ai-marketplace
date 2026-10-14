// AC-28, AC-30, AC-31, AC-32, AC-46: the install builder.
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

const box = (page, name) => page.locator(`#builder input[type="checkbox"][value="${name}"]`);
const row = (page, name) => page.locator('#builder .builder-row').filter({ has: page.locator(`input[value="${name}"]`) });

async function open(page, query = '') {
  await page.goto(`${server.url}/${query}`);
  await expect(page.locator('#builder')).toBeVisible();
}

test('AC-32: with nothing selected the builder shows guidance and no copy buttons', async ({ page }) => {
  await open(page);
  await expect(page.locator('#builder')).toContainText('Select one or more plugins');
  await expect(page.locator('#builder button')).toHaveCount(0);
});

test('AC-28: a dependency stays ticked and says who requires it, until the dependent is unticked', async ({ page }) => {
  await open(page);
  await box(page, 'suite').check();
  for (const name of ['alpha', 'beta', 'gamma', 'delta']) {
    await expect(box(page, name)).toBeChecked();
    await expect(box(page, name)).toBeDisabled();
    await expect(row(page, name)).toContainText('required by');
    await expect(row(page, name)).toContainText('added automatically');
  }
  await expect(row(page, 'gamma')).toContainText('required by beta');
  await expect(box(page, 'suite')).toBeEnabled();
  await box(page, 'suite').uncheck();
  for (const name of ['alpha', 'beta', 'gamma', 'delta']) {
    await expect(box(page, name)).not.toBeChecked();
    await expect(box(page, name)).toBeEnabled();
  }
  await expect(page.locator('#builder button')).toHaveCount(0);
});

test('AC-30, AC-31: two copy buttons, the ranges and the range note', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: server.url });
  await open(page);
  await box(page, 'suite').check();
  const buttons = page.locator('#builder button[data-copy]');
  await expect(buttons).toHaveCount(2);
  await expect(page.locator('#builder')).toContainText('^0.2.0 (declared by gamma)');
  await expect(page.locator('#builder .range-note')).toContainText('<plugin>--v<semver> release tags');
  await expect(page.locator('#builder .range-note')).toContainText('not checked by the site');

  await page.locator('#builder button[data-copy="commands"]').click();
  await expect(page.locator('#copy-status')).toHaveText('Copied');
  const commands = await page.evaluate(() => navigator.clipboard.readText());
  const lines = commands.split('\n');
  expect(lines[0]).toBe('/plugin marketplace add HlibHav/dev-digest-ai-marketplace');
  expect(lines.slice(1).sort()).toEqual(
    ['alpha', 'beta', 'delta', 'gamma', 'suite'].map((n) => `/plugin install ${n}@dev-digest-ai-marketplace`),
  );

  await page.locator('#builder button[data-copy="snippet"]').click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).not.toBe(commands);
  const snippet = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
  expect(snippet.extraKnownMarketplaces['dev-digest-ai-marketplace'].source).toEqual({
    source: 'github',
    repo: 'HlibHav/dev-digest-ai-marketplace',
  });
  expect(Object.keys(snippet.enabledPlugins).sort()).toEqual(
    ['alpha', 'beta', 'delta', 'gamma', 'suite'].map((n) => `${n}@dev-digest-ai-marketplace`),
  );
});

test('the selection is mirrored in ?plugins= and restored from it', async ({ page }) => {
  await open(page);
  await box(page, 'gamma').check();
  await expect.poll(() => new URL(page.url()).searchParams.get('plugins')).toBe('gamma');
  await open(page, '?plugins=gamma');
  await expect(box(page, 'gamma')).toBeChecked();
  await expect(box(page, 'gamma')).toBeEnabled();
  await expect(box(page, 'delta')).toBeChecked();
  await expect(box(page, 'delta')).toBeDisabled();
});

test('AC-46: the checkboxes work from the keyboard', async ({ page }) => {
  await open(page);
  await box(page, 'epsilon').focus();
  await page.keyboard.press('Space');
  await expect(box(page, 'epsilon')).toBeChecked();
  await expect(page.locator('#builder button[data-copy]')).toHaveCount(2);
  await page.keyboard.press('Space');
  await expect(box(page, 'epsilon')).not.toBeChecked();
  await expect(page.locator('#builder button')).toHaveCount(0);
});
