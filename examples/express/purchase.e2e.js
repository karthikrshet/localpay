// Phase 2 gate: a full purchase in a real browser, with no network access beyond 127.0.0.1.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// LocalPay and the shop are started by playwright.config.ts (webServer).
let blocked = [];

test.beforeEach(async ({ page }) => {
  blocked = [];
  await page.route('**/*', (route) => {
    const { hostname } = new URL(route.request().url());
    if (hostname === '127.0.0.1') return route.continue();
    blocked.push(route.request().url());
    return route.abort();
  });
});

test.afterEach(() => {
  expect(blocked, 'requests left 127.0.0.1').toEqual([]);
});

test('buy → pay successfully → fulfilled by the capture webhook', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Buy' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('TEST MODE · LocalPay · no real money moves');
  await expect(dialog).toContainText('₹499.00');

  const accessibility = await new AxeBuilder({ page }).include('localpay-checkout').analyze();
  expect(accessibility.violations.map((v) => `${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);

  await dialog.getByRole('button', { name: /Pay successfully/ }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('status')).toHaveText('Order fulfilled', { timeout: 10_000 });
});

test('a failed payment is reported and the customer can close checkout', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Buy' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /Fail: insufficient funds/ }).click();
  await expect(dialog.getByRole('alert')).toContainText('Payment failed');
  await expect(page.getByRole('status')).toContainText('Payment failed:');
  await dialog.getByRole('button', { name: 'Close without paying' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('status')).toHaveText('Checkout closed');
});

test('checkout fits a 360 px phone screen and closes with Escape', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Buy' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box?.width ?? 999).toBeLessThanOrEqual(360);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('checkout keeps its styles on a page with a strict style-src CSP', async ({ page }) => {
  // e2e-servers.js serves /strict-csp with a CSP that blocks <style> elements.
  await page.goto('/strict-csp');
  await page.getByRole('button', { name: 'Open' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // Styled: the sheet is a white, rounded card, not an unstyled block.
  const radius = await dialog.evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
  expect(radius).toBe('12px');
});
