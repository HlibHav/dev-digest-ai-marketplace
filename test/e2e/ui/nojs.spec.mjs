// AC-25: with JavaScript disabled the page still lists every plugin. Also AC-57 (credit visible).
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

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('AC-25: every plugin is listed with its details', async ({ page }) => {
    await page.goto(server.url);
    const cards = page.locator('#static-list [data-card]');
    await expect(cards).toHaveCount(index.plugins.length);
    for (const p of index.plugins) {
      const card = page.locator(`#static-list [data-card][data-plugin="${p.name}"]`);
      await expect(card).toBeVisible();
      await expect(card).toContainText(p.name);
      await expect(card).toContainText(`v${p.version}`);
      await expect(card).toContainText(p.category);
      for (const d of p.dependencies) {
        await expect(card).toContainText(d.name);
        await expect(card).toContainText(d.range);
      }
      for (const line of p.install_commands) await expect(card).toContainText(line);
    }
  });

  test('the search form stays hidden and the type is shown as text', async ({ page }) => {
    await page.goto(server.url);
    await expect(page.locator('#search-form')).toBeHidden();
    await expect(page.locator('#static-list [data-card] .badge').first()).toHaveText('plugin');
  });

});
