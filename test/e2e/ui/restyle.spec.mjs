// Catalog restyle: the install rail and tray/sheet, install-set sync, the owner chip, list mode, the opened
// disclosure, the search shortcuts and the card glow on keyboard focus. Runs against the fixture site.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { serve } from '../helpers/serve.mjs';
import { buildFixtureSite } from '../helpers/build-fixture-site.mjs';
import { stubWebGpu } from '../helpers/fx-stubs.mjs';

let server;

test.beforeAll(async () => {
  server = await serve(buildFixtureSite());
});

test.afterAll(async () => {
  await server.close();
});

async function open(page, query = '') {
  await page.goto(`${server.url}/${query}`);
  await expect(page.locator('#search-form')).toBeVisible();
  await expect(page.locator('#builder')).toBeAttached();
}

const overflow = (page) =>
  page.evaluate(() => ({
    doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.documentElement.clientWidth,
  }));

const insideBuilder = (page) => page.evaluate(() => Boolean(document.activeElement?.closest('#builder')));
const inertOf = (page, selector) => page.evaluate((s) => document.querySelector(s).inert, selector);

test.describe('wide layout (1280)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('the builder is a sticky right rail after the results, and there is no tray', async ({ page }) => {
    await open(page);
    await expect(page.locator('#builder')).toBeVisible();
    await expect(page.locator('#builder-tray')).toBeHidden();
    const info = await page.evaluate(() => {
      const main = document.getElementById('main').getBoundingClientRect();
      const rail = document.getElementById('builder').getBoundingClientRect();
      return {
        railRight: rail.left >= main.right - 1,
        position: getComputedStyle(document.getElementById('builder')).position,
        width: Math.round(rail.width),
        order: Boolean(document.getElementById('main').compareDocumentPosition(document.getElementById('builder')) & Node.DOCUMENT_POSITION_FOLLOWING),
      };
    });
    expect(info).toEqual({ railRight: true, position: 'sticky', width: 352, order: true });
  });

  test('a plugin card install-set box and the builder stay in sync, in both directions, with locked dependencies', async ({ page }) => {
    await open(page);
    await page.locator('#app input[name="type"][value="plugin"]').check();
    const addSet = (name) => page.locator(`#plugin-${name} input[data-add-set]`);
    await expect(addSet('suite')).not.toBeChecked();

    // card -> builder
    await addSet('suite').check();
    await expect(page.locator('#builder input[value="suite"]')).toBeChecked();
    await expect(page.locator('#builder input[value="alpha"]')).toBeChecked();
    // the dependencies show as ticked and locked on their own cards too
    for (const name of ['alpha', 'beta', 'gamma', 'delta']) {
      await expect(addSet(name)).toBeChecked();
      await expect(addSet(name)).toBeDisabled();
      // the card says why in plain text, not only through the greyed box
      await expect(page.locator(`#plugin-${name} .add-set-note`)).toContainText('Added as a dependency of suite');
      await expect(addSet(name)).toHaveAttribute('aria-describedby', `add-set-note-${name}`);
    }
    await expect(page.locator('#plugin-suite .add-set')).toHaveText('Add to install set');
    await expect(page.locator('#plugin-suite .add-set-note')).toBeHidden();
    await expect(page.locator('#builder-count')).toHaveText('5 selected');

    // builder -> card
    await page.locator('#builder input[value="suite"]').uncheck();
    for (const name of ['alpha', 'suite']) await expect(addSet(name)).not.toBeChecked();
    await expect(addSet('alpha')).toBeEnabled();
    await expect(page.locator('#plugin-alpha .add-set-note')).toBeHidden();
    await page.locator('#builder input[value="epsilon"]').check();
    await expect(addSet('epsilon')).toBeChecked();

    // the state survives a re-render of the cards
    await page.locator('#q').fill('epsilon');
    await expect(page.locator('#plugin-epsilon input[data-add-set]')).toBeChecked();
  });

  test('the grid becomes list rows for a free-text query and goes back for the empty query and type listings', async ({ page }) => {
    await open(page);
    const grid = page.locator('#app .grid');
    await expect(grid).not.toHaveClass(/is-list/);
    await page.locator('#q').fill('review');
    await expect(page.locator('#result-count')).toHaveText(/^\d+ results?$/);
    await expect(grid).toHaveClass(/is-list/);
    const cols = await grid.evaluate((g) => getComputedStyle(g).gridTemplateColumns.split(' ').length);
    expect(cols).toBe(1);
    await page.locator('#q').fill('');
    await expect(page.locator('#result-count')).toContainText('full catalog');
    await expect(grid).not.toHaveClass(/is-list/);
    await page.locator('#app input[name="type"][value="skill"]').check();
    await expect(grid).not.toHaveClass(/is-list/);
    await page.locator('#q').fill('skills');
    await expect(page.locator('#result-count')).toHaveText(/^\d+ results?$/);
    await expect(grid).not.toHaveClass(/is-list/);
  });

  test('the owner chip jumps to the plugin card, even when the current results leave that card out', async ({ page }) => {
    await open(page);
    await page.locator('#q').fill('lookup');
    await expect(page.locator('#result-count')).toHaveText(/^\d+ results?$/);
    const chip = page.locator('#app [data-card][data-type="skill"]').filter({ hasText: '/alpha:lookup' }).locator('a.owner');
    await expect(chip).toHaveAttribute('href', '#plugin-alpha');
    await expect(page.locator('#plugin-alpha')).toHaveCount(0);
    await chip.click();
    await expect(page.locator('#plugin-alpha')).toBeVisible();
    await expect(page.locator('#plugin-alpha')).toBeFocused();
    await expect(page.locator('#q')).toHaveValue('');
    expect(new URL(page.url()).searchParams.get('q')).toBeNull();
  });

  test('the owner chip keeps the query when the plugin card is already on the page', async ({ page }) => {
    await open(page);
    await page.locator('#q').fill('alpha');
    await expect(page.locator('#result-count')).toHaveText(/^\d+ results?$/);
    const skill = page.locator('#app [data-card]:not([data-type="plugin"])[data-plugin="alpha"]').first();
    await skill.locator('a.owner').click();
    await expect(page.locator('#plugin-alpha')).toBeFocused();
    await expect(page.locator('#q')).toHaveValue('alpha');
  });

  test('"/" focuses the search box, and the clear mark empties it', async ({ page }) => {
    await open(page);
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('/');
    await expect(page.locator('#q')).toBeFocused();
    await expect(page.locator('#q')).toHaveValue('');
    await page.keyboard.type('review');
    await expect(page.locator('#search-clear')).toBeVisible();
    await page.locator('#search-clear').click();
    await expect(page.locator('#q')).toHaveValue('');
    await expect(page.locator('#search-clear')).toBeHidden();
    await expect(page.locator('#q')).toBeFocused();
  });

  test('a card glows on keyboard focus: the effect turns on and the card shows a rim', async ({ page }) => {
    await stubWebGpu(page, true);
    // The effects bundle is a dynamic import that attaches the focus listener after the page is
    // usable. Delay it so the race always happens, then wait for the header effect: the controller
    // turns it on in the same task that attaches the card listeners.
    await page.route('**/fx-entry*.js', async (route) => {
      await new Promise((r) => setTimeout(r, 400));
      return route.continue();
    });
    await open(page);
    await expect(page.locator('#site-header[data-fx-header]')).toHaveAttribute('data-fx-state', 'on');
    const card = page.locator('#app [data-card][data-type="plugin"]').first();
    await card.locator('button[data-copy]').focus();
    await expect(card).toHaveAttribute('data-fx-state', 'on');
    expect(await card.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none');
    await card.locator('button[data-copy]').blur();
    await expect(card).toHaveAttribute('data-fx-state', 'off');
  });

  test('the front line states facts and "about"; the back shows neutral flags and no verdicts', async ({ page }) => {
    await open(page);
    await page.locator('#app input[name="type"][value="plugin"]').check();
    const card = page.locator('#plugin-beta');
    await expect(card.locator('.trust-toggle')).toContainText('Declares 2 hooks (1 broad)');
    await expect(card.locator('.trust-toggle')).toContainText('about');
    await card.locator('.trust-toggle').click();
    await expect(card.locator('.flag')).toHaveText(['broad matcher', 'non-loopback', 'scripts']);
    await expect(card.locator('.card-back')).not.toContainText(/\b(safe|unsafe|dangerous|risky|verified)\b/i);
  });
});

test.describe('narrow layout (375)', () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test('the tray shows the count and opens the builder as a modal sheet; Escape returns focus', async ({ page }) => {
    await open(page, '?plugins=suite');
    await expect(page.locator('#builder-tray')).toBeVisible();
    await expect(page.locator('#builder')).toBeHidden();
    await expect(page.locator('#tray-open')).toHaveAttribute('aria-controls', 'builder');
    await expect(page.locator('#tray-summary')).toContainText('5 plugins');

    await page.locator('#tray-open').click();
    await expect(page.locator('#builder')).toBeVisible();
    await expect(page.locator('#builder')).toHaveAttribute('data-open', '');
    await expect(page.locator('#builder')).toHaveAttribute('role', 'dialog');
    await expect(page.locator('#builder')).toHaveAttribute('aria-modal', 'true');
    await expect(page.locator('#tray-open')).toHaveAttribute('aria-expanded', 'true');
    expect(await insideBuilder(page)).toBe(true);
    for (const sel of ['#site-header', '#main', '.site-footer', '#builder-tray']) expect(await inertOf(page, sel), sel).toBe(true);
    expect(await inertOf(page, '#builder')).toBe(false);

    // Tab never leaves the sheet while it is open
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement === document.body || Boolean(document.activeElement.closest('#builder')))).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(page.locator('#builder')).toBeHidden();
    await expect(page.locator('#tray-open')).toBeFocused();
    await expect(page.locator('#tray-open')).toHaveAttribute('aria-expanded', 'false');
    for (const sel of ['#site-header', '#main', '.site-footer', '#builder-tray']) expect(await inertOf(page, sel), sel).toBe(false);
    await expect(page.locator('#builder')).not.toHaveAttribute('role', 'dialog');
  });

  test('the close button also returns focus to the tray button, and the sheet follows the install set', async ({ page }) => {
    await open(page);
    await expect(page.locator('#tray-summary')).toHaveText('None selected');
    await page.locator('#tray-open').click();
    await page.locator('#builder input[value="gamma"]').check();
    await page.locator('#builder [data-close]').click();
    await expect(page.locator('#builder')).toBeHidden();
    await expect(page.locator('#tray-open')).toBeFocused();
    await expect(page.locator('#tray-summary')).toContainText('2 plugins: gamma, delta');
    // no close button is left behind in the desktop rail markup
    await expect(page.locator('#builder [data-close]')).toHaveCount(0);
  });

  test('the sheet closes when the window grows past 1024 px, with the page usable again', async ({ page }) => {
    await open(page);
    await page.locator('#tray-open').click();
    await expect(page.locator('#builder')).toHaveAttribute('data-open', '');
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator('#builder')).not.toHaveAttribute('data-open', '');
    await expect(page.locator('#builder')).toBeVisible();
    expect(await inertOf(page, '#main')).toBe(false);
  });

  for (const scheme of ['light', 'dark']) {
    test(`no horizontal overflow at 320 px, closed and with the sheet open (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width: 320, height: 700 });
      await open(page, '?plugins=suite');
      await page.locator('#app input[name="type"][value="plugin"]').check();
      await page.locator('#plugin-beta .trust-toggle').click();
      expect((await overflow(page)).doc).toBeLessThanOrEqual(0);
      expect((await overflow(page)).body).toBeLessThanOrEqual(0);
      await page.locator('#tray-open').click();
      await expect(page.locator('#builder')).toBeVisible();
      expect((await overflow(page)).doc).toBeLessThanOrEqual(0);
      expect((await overflow(page)).body).toBeLessThanOrEqual(0);
    });
  }
});

for (const [width, height] of [[1280, 800], [375, 800]]) {
  for (const scheme of ['light', 'dark']) {
    test(`axe finds no serious or critical violation at ${width} px (${scheme})`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme: scheme });
      await open(page, '?plugins=suite');
      await page.locator('#app input[name="type"][value="plugin"]').check();
      await page.locator('#plugin-beta .trust-toggle').click();
      const scan = async () => {
        const results = await new AxeBuilder({ page }).analyze();
        return results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
      };
      expect(await scan()).toEqual([]);
      await page.locator('#q').fill('review');
      await expect(page.locator('#app .grid')).toHaveClass(/is-list/);
      expect(await scan()).toEqual([]);
      if (width < 1024) {
        await page.locator('#tray-open').click();
        await expect(page.locator('#builder')).toHaveAttribute('data-open', '');
        expect(await scan()).toEqual([]);
      }
    });
  }
}

test.describe('polish', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('the entry count is shown once, in the live status line', async ({ page }) => {
    await open(page);
    await expect(page.locator('#catalog-title .count')).toBeHidden();
    await expect(page.locator('#result-count')).toHaveText(/23 entries/);
  });

  test('the search icon is a drawn magnifier, hidden from assistive tech', async ({ page }) => {
    await open(page);
    const icon = page.locator('svg.search-icon');
    await expect(icon).toBeVisible();
    await expect(icon).toHaveAttribute('aria-hidden', 'true');
    await expect(icon.locator('circle')).toHaveCount(1);
  });

  test('in list mode the description starts on the name row', async ({ page }) => {
    await open(page, '?q=architecture+review');
    const card = page.locator('[data-fx-cards].is-list [data-card]').first();
    await expect(card).toBeVisible();
    const [title, desc] = await Promise.all([
      card.locator('.card-title').boundingBox(),
      card.locator('.card-desc').boundingBox(),
    ]);
    expect(Math.abs(desc.y - title.y)).toBeLessThan(12);
  });
});
