// Starts LocalPay and the example shop for the browser tests (Playwright webServer).
// Run: node --experimental-strip-types examples/express/e2e-servers.js
import { createLocalPay } from '@localpay/server';
import { createShop } from './server.js';

const localpayPort = Number(process.env.LOCALPAY_PORT ?? 4011);
const shopPort = Number(process.env.SHOP_PORT ?? 3011);

// E2E_ADMIN_TOKEN lets the browser tests open the dashboard; random otherwise.
const localpay = await createLocalPay({ port: localpayPort }, process.env.E2E_ADMIN_TOKEN ? { adminToken: process.env.E2E_ADMIN_TOKEN } : {});
const localpayUrl = await localpay.listen();
const shop = createShop({ LOCALPAY_URL: localpayUrl });
shop.app.listen(shopPort, '127.0.0.1', () => {
  localpay.webhookTargets.push({ id: 'shop', url: `http://127.0.0.1:${shopPort}/webhooks`, secret: 'localpay_webhook_secret' });
  console.log(`LocalPay ${localpayUrl} · shop http://127.0.0.1:${shopPort} · dashboard ${localpay.dashboardUrl(localpayUrl)}`);
});
