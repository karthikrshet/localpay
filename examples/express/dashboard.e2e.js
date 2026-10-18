// Phase 3: the dashboard shows a purchase and can replay its webhooks.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const LOCALPAY = 'http://127.0.0.1:4011';

test('dashboard shows the order timeline and replays a webhook', async ({ page }) => {
  // Make a purchase through the shop first.
  await page.goto('/');
  await page.getByRole('button', { name: 'Buy' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Pay successfully/ }).click();
  await expect(page.getByRole('status')).toHaveText('Order fulfilled', { timeout: 10_000 });

  // Without the token the dashboard stays locked.
  await page.goto(LOCALPAY);
  await expect(page.getByText('printed in your terminal')).toBeVisible();

  await page.goto(`${LOCALPAY}/?token=e2e-dashboard-token`);
  await expect(page).toHaveURL(`${LOCALPAY}/`);
  await expect(page.getByText('rzp_test_LocalPayDemo01').first()).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);

  await page.getByRole('link', { name: 'Orders' }).click();
  await page.locator('tr', { hasText: 'paid' }).getByRole('link', { name: /^order_/ }).first().click();
  await expect(page.getByText('order.paid').first()).toBeVisible();

  await page.getByRole('link', { name: 'Webhooks' }).click();
  const rows = page.locator('tbody tr');
  const before = await rows.count();
  await page.getByRole('button', { name: 'order.paid' }).first().click();
  await page.getByRole('button', { name: 'Replay now' }).click();
  await expect(page.getByText('replay').first()).toBeVisible({ timeout: 10_000 });
  expect(await rows.count()).toBeGreaterThan(before);
});
