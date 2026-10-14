// AC-21 and AC-59: copy-install on a card, and the manual fallback.
import { test, expect } from '@playwright/test';
import { serve } from '../helpers/serve.mjs';
import { buildFixtureSite } from '../helpers/build-fixture-site.mjs';

const EXPECTED = [
  '/plugin marketplace add HlibHav/dev-digest-ai-marketplace',
  '/plugin install alpha@dev-digest-ai-marketplace',
].join('\n');
const MANUAL = 'Copy is unavailable here. Select the text and copy it manually.';

let server;

test.beforeAll(async () => {
  server = await serve(buildFixtureSite());
});

test.afterAll(async () => {
  await server.close();
});

async function findLookupCard(page) {
  await page.goto(server.url);
  await page.locator('#q').fill('lookup');
  await expect(page.locator('#result-count')).toHaveText(/^\d+ results?$/);
  const card = page.locator('#app [data-card][data-type="skill"]').filter({ hasText: '/alpha:lookup' });
  await expect(card).toBeVisible();
  return card;
}

test('AC-21: the button copies the two install lines and announces Copied', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: server.url });
  const card = await findLookupCard(page);
  await card.getByRole('button', { name: /^Copy install/ }).click();
  await expect(page.locator('#copy-status')).toHaveText('Copied');
  await expect(page.locator('#copy-status')).toHaveAttribute('aria-live', 'polite');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(EXPECTED);
});

test('copy falls back when the clipboard API is missing', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
  });
  const card = await findLookupCard(page);
  await card.getByRole('button', { name: /^Copy install/ }).click();
  await expect(page.locator('#copy-status')).toHaveText(MANUAL);
  await expect(card.locator('pre')).toHaveText(EXPECTED);
  await expect.poll(() => page.evaluate(() => window.getSelection().toString())).toBe(EXPECTED);
});

test('copy falls back when the clipboard refuses', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('denied')) },
      configurable: true,
    });
  });
  const card = await findLookupCard(page);
  await card.getByRole('button', { name: /^Copy install/ }).click();
  await expect(page.locator('#copy-status')).toHaveText(MANUAL);
  await expect.poll(() => page.evaluate(() => window.getSelection().toString())).toBe(EXPECTED);
});
