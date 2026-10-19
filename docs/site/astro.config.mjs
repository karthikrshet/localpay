// @ts-check
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

export default defineConfig({
  integrations: [
    starlight({
      title: 'LocalPay',
      description: 'A Razorpay-compatible payment emulator for local testing. No keys, no tunnels, no real money.',
      customCss: ['./src/styles/custom.css'],
      // Light only, like the dashboard.
      components: {
        ThemeSelect: './src/components/Empty.astro',
        ThemeProvider: './src/components/LightTheme.astro',
      },
      sidebar: [
        { label: 'Start here', items: [{ slug: 'quickstart' }, { slug: 'why' }] },
        {
          label: 'Guides',
          items: [
            { slug: 'guides/sdk-setup' },
            { slug: 'guides/checkout' },
            { slug: 'guides/signatures' },
            { slug: 'guides/webhooks' },
            { slug: 'guides/payment-links' },
            { slug: 'guides/subscriptions' },
            { slug: 'guides/scenarios' },
            { slug: 'guides/test-values' },
            { slug: 'guides/time-travel' },
            { slug: 'guides/record-replay' },
          ],
        },
        { label: 'Reference', items: [{ slug: 'reference/cli' }, { slug: 'reference/compatibility' }, { slug: 'reference/security' }, { slug: 'reference/providers' }] },
      ],
    }),
  ],
});
