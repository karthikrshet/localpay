import { defineConfig, devices } from '@playwright/test';

// Browser tests for the example apps. The servers run in their own process on
// 127.0.0.1, and the tests block requests to any other host, so they run offline.
export default defineConfig({
  testDir: './examples',
  testMatch: '**/*.e2e.js',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://127.0.0.1:3011', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node --experimental-strip-types --no-warnings examples/express/e2e-servers.js',
    url: 'http://127.0.0.1:3011',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
