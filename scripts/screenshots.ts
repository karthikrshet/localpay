// Captures README screenshots of the checkout popup and the dashboard.
// Start the example servers first:
//   node --experimental-strip-types examples/express/e2e-servers.js
// then, with the dashboard link it prints:
//   LOCALPAY_DASHBOARD='http://127.0.0.1:4011/?token=…' node --experimental-strip-types scripts/screenshots.ts
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const SHOP = 'http://127.0.0.1:3011';
const OUT = 'docs/assets';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 760 }, deviceScaleFactor: 2, colorScheme: 'light' });

// Checkout popup over the example shop.
await page.goto(SHOP);
await page.getByRole('button', { name: 'Buy' }).click();
await page.getByRole('dialog').waitFor();
await page.waitForTimeout(300);
await page.screenshot({ path: join(OUT, 'checkout.png') });

// Pay, so the dashboard has data and webhooks.
await page.getByRole('button', { name: /Pay successfully/ }).click();
await page.getByRole('status').filter({ hasText: 'Order fulfilled' }).waitFor({ timeout: 10_000 });

// Dashboard: pass the link printed by e2e-servers.js as LOCALPAY_DASHBOARD.
const dashboard = process.env.LOCALPAY_DASHBOARD;
if (dashboard) {
  await page.goto(dashboard);
  await page.goto(`${new URL(dashboard).origin}/webhooks`);
  await page.getByText('order.paid').first().click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, 'dashboard-webhooks.png') });
} else {
  console.warn('LOCALPAY_DASHBOARD not set; skipping the dashboard screenshot');
}

await browser.close();
console.log(`screenshots written to ${OUT}/`);
