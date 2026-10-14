// AC-36 and AC-39: trust profile and context cost on the plugin card.
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

async function pluginCard(page, name) {
  await page.goto(server.url);
  await page.locator('#app input[name="type"][value="plugin"]').check();
  const card = page.locator(`#app [data-card][data-type="plugin"][data-plugin="${name}"]`);
  await expect(card).toBeVisible();
  await card.locator('.trust-toggle').click();
  await expect(card.locator('.trust-toggle')).toHaveAttribute('aria-expanded', 'true');
  const details = card.locator('.card-back');
  await expect(details).toBeVisible();
  return details;
}

test('AC-36: the notice, URLs as plain text, and a non-loopback flag', async ({ page }) => {
  const details = await pluginCard(page, 'beta');
  await expect(details).toContainText('describes what this plugin declares, not a security audit');
  await expect(details.locator('a')).toHaveCount(0);
  await expect(details).toContainText('https://example.com/mcp');
  await expect(details.locator('code', { hasText: 'https://example.com/mcp' })).toBeVisible();
  await expect(details).toContainText('non-loopback');
  await expect(details).toContainText('Hook PreToolUse (broad), no matcher');
  await expect(details).toContainText('a scripts/ folder');
});

test('AC-35: a loopback server is not flagged', async ({ page }) => {
  const details = await pluginCard(page, 'alpha');
  await expect(details).toContainText('http://localhost:8080/mcp');
  await expect(details).not.toContainText('non-loopback');
  await expect(details).toContainText('matcher: Write');
});

test('AC-39: cost figures are labelled as estimates with the method and the exclusions', async ({ page }) => {
  const details = await pluginCard(page, 'beta');
  await expect(details).toContainText(/Always loaded: about [\d,]+ tokens \(estimate\)/);
  await expect(details).toContainText(/Loaded on invocation: about [\d,]+ tokens \(estimate\)/);
  await expect(details).toContainText('characters ÷ 4');
  await expect(details).toContainText('hook output');
  await expect(details).toContainText('MCP tool descriptions and results');
});

test('AC-37, AC-40: a plugin with nothing declared says so', async ({ page }) => {
  const details = await pluginCard(page, 'epsilon');
  await expect(details).toContainText('declares no hooks, MCP servers or scripts');
  await expect(details).toContainText('0 tokens (no loaded content)');
});
