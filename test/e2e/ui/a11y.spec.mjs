// AC-46: keyboard operation, a visible focus indicator and zero serious axe violations.
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

async function tabUntil(page, predicate, max = 40) {
  for (let i = 0; i < max; i += 1) {
    await page.keyboard.press('Tab');
    if (await page.evaluate(predicate)) return true;
  }
  return false;
}

test('search, filters and copy buttons work with the keyboard alone', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: server.url });
  await page.goto(server.url);
  await expect(page.locator('#search-form')).toBeVisible();

  expect(await tabUntil(page, () => document.activeElement?.id === 'q', 5)).toBe(true);
  await page.keyboard.type('lookup');
  await expect(page.locator('#result-count')).toHaveText(/^\d+ results?$/);
  const card = page.locator('#app [data-card]').filter({ hasText: '/alpha:lookup' });
  await expect(card).toBeVisible();

  // A type checkbox is reachable and toggles with Space.
  expect(await tabUntil(page, () => document.activeElement?.matches('input[name="type"][value="plugin"]'), 12)).toBe(true);
  await page.keyboard.press('Space');
  await expect(page.locator('#app input[name="type"][value="plugin"]')).toBeChecked();
  await page.keyboard.press('Space');
  await expect(page.locator('#app input[name="type"][value="plugin"]')).not.toBeChecked();

  // The copy button shows a visible focus indicator and copies on Enter.
  expect(await tabUntil(page, () => document.activeElement?.matches('#app [data-card] button[data-copy]'), 30)).toBe(true);
  const outline = await page.evaluate(() => {
    const style = getComputedStyle(document.activeElement);
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
  expect(outline.style).not.toBe('none');
  expect(outline.width).toBeGreaterThan(0);
  await page.keyboard.press('Enter');
  await expect(page.locator('#copy-status')).toHaveText('Copied');
});

test('every control has an accessible name', async ({ page }) => {
  await page.goto(`${server.url}/?plugins=suite`);
  await expect(page.locator('#builder button[data-copy]')).toHaveCount(2);
  const unnamed = await page.evaluate(() => {
    const controls = [...document.querySelectorAll('button, input, summary, select, textarea')].filter((el) => !el.closest('[hidden]'));
    return controls
      .filter((el) => {
        const label = el.getAttribute('aria-label') || el.labels?.[0]?.textContent || el.textContent;
        return !String(label ?? '').trim();
      })
      .map((el) => el.outerHTML.slice(0, 80));
  });
  expect(unnamed).toEqual([]);
});

for (const scheme of ['light', 'dark']) {
  test(`axe finds no serious violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(`${server.url}/?plugins=suite`);
    await expect(page.locator('#builder button[data-copy]')).toHaveCount(2);
    await page.locator('#app input[name="type"][value="plugin"]').check();
    await page.locator('#app [data-card] .trust-toggle').first().click();
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
  });
}
