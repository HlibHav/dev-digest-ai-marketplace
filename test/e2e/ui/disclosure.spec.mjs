// AC-60: "Trust and cost" opens on the back of the card without moving it. The card keeps its grid cell and size.
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

// tall enough that clicking a trigger never scrolls the page, so every box is compared as it was
test.use({ viewport: { width: 1280, height: 1500 } });

const box = async (locator) => locator.boundingBox();
const near = (actual, expected) => {
  for (const k of ['x', 'y', 'width', 'height']) expect(Math.abs(actual[k] - expected[k])).toBeLessThanOrEqual(1);
};

async function plugins(page) {
  await page.goto(server.url);
  await page.locator('#app input[name="type"][value="plugin"]').check();
  const cards = page.locator('#app [data-card][data-type="plugin"]');
  await expect(cards.nth(1)).toBeVisible();
  return cards;
}

test('AC-60: flipping a card keeps it, its row neighbour and the scroll position where they were', async ({ page }) => {
  const cards = await plugins(page);
  const first = cards.nth(0);
  const second = cards.nth(1);
  const before = { first: await box(first), second: await box(second), scroll: await page.evaluate(() => window.scrollY) };
  // the two cards share a row
  expect(Math.abs(before.first.y - before.second.y)).toBeLessThanOrEqual(1);
  expect(before.second.x).toBeGreaterThan(before.first.x + 100);

  const trigger = first.locator('.trust-toggle');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const back = first.locator('.card-back');
  await expect(back).toBeVisible();
  await expect(back).toContainText('Trust profile');
  await expect(back).toContainText('Context cost');
  await page.waitForTimeout(500);
  near(await box(first), before.first);
  near(await box(second), before.second);

  // a second card flips too; the first stays on its back
  await second.locator('.trust-toggle').click();
  await expect(second.locator('.card-back')).toBeVisible();
  await expect(back).toBeVisible();
  await page.waitForTimeout(500);
  near(await box(first), before.first);
  near(await box(second), before.second);
  expect(await page.evaluate(() => window.scrollY)).toBe(before.scroll);
});

test('AC-60: focus goes to Back, Escape and Back return it to the trigger, and the hidden face is inert', async ({ page }) => {
  const cards = await plugins(page);
  const card = cards.nth(0);
  const trigger = card.locator('.trust-toggle');
  const back = card.locator('.card-back');
  const front = card.locator('.card-front');
  await expect(back).toHaveAttribute('inert', '');
  await expect(back).toHaveAttribute('aria-hidden', 'true');
  await expect(trigger).toHaveAttribute('aria-controls', (await back.getAttribute('id')) ?? '');

  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(card.locator('.back-btn')).toBeFocused();
  await expect(card.locator('.back-btn')).toHaveText('← Back');
  await expect(card.locator('.back-title')).toHaveText((await card.getAttribute('data-plugin')) ?? '');
  await expect(front).toHaveAttribute('inert', '');
  await expect(front).toHaveAttribute('aria-hidden', 'true');
  await expect(back).not.toHaveAttribute('inert', '');
  // Tab walks the back (Back, then the scroll region) and never lands on the turned-away front
  const onFront = () => page.evaluate(() => Boolean(document.activeElement?.closest('[data-plugin] .card-front[inert]')));
  await page.keyboard.press('Tab');
  await expect(card.locator('.back-body')).toBeFocused();
  await page.keyboard.press('Tab');
  expect(await onFront()).toBe(false);
  await page.keyboard.press('Shift+Tab');

  await card.locator('.back-btn').focus();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(back).toHaveAttribute('inert', '');
  await expect(front).not.toHaveAttribute('inert', '');

  // the Back button does the same
  await trigger.click();
  await expect(card.locator('.back-btn')).toBeFocused();
  await card.locator('.back-btn').click();
  await expect(trigger).toBeFocused();
});

test('AC-60: a back taller than the card scrolls inside a focusable region', async ({ page }) => {
  const cards = await plugins(page);
  const card = cards.nth(0);
  await page.setViewportSize({ width: 320, height: 700 });
  await card.locator('.trust-toggle').click();
  const region = card.locator('.back-body');
  await expect(region).toHaveAttribute('role', 'region');
  await expect(region).toHaveAttribute('tabindex', '0');
  expect(await region.getAttribute('aria-label')).toContain('Trust and cost details');
  expect(await region.evaluate((el) => getComputedStyle(el).overflowY)).toBe('auto');
});

test('AC-60: with reduced motion the card cross-fades instead of turning', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const cards = await plugins(page);
  const card = cards.nth(0);
  const before = await box(card);
  await card.locator('.trust-toggle').click();
  const back = card.locator('.card-back');
  await expect(back).toBeVisible();
  await expect(card.locator('.back-btn')).toBeFocused();
  const styles = await card.evaluate((el) => {
    const read = (sel) => getComputedStyle(el.querySelector(sel));
    return { inner: read('.card-inner').transform, back: read('.card-back').transform, backOpacity: read('.card-back').opacity, frontOpacity: read('.card-front').opacity };
  });
  expect(styles.inner).toBe('none');
  expect(styles.back).toBe('none');
  await expect.poll(() => card.evaluate((el) => getComputedStyle(el.querySelector('.card-back')).opacity)).toBe('1');
  await expect.poll(() => card.evaluate((el) => getComputedStyle(el.querySelector('.card-front')).opacity)).toBe('0');
  near(await box(card), before);
  await page.keyboard.press('Escape');
  await expect(card.locator('.trust-toggle')).toBeFocused();
});

test('AC-60: in list mode the card flips in place too', async ({ page }) => {
  await page.goto(server.url);
  await page.locator('#q').fill('review');
  await expect(page.locator('#app .grid')).toHaveClass(/is-list/);
  const card = page.locator('#app [data-card][data-type="plugin"]').first();
  await expect(card).toBeVisible();
  const before = await box(card);
  await card.locator('.trust-toggle').click();
  await expect(card.locator('.card-back')).toBeVisible();
  await expect(card.locator('.back-btn')).toBeFocused();
  await page.waitForTimeout(500);
  near(await box(card), before);
  await page.keyboard.press('Escape');
  await expect(card.locator('.trust-toggle')).toBeFocused();
});
