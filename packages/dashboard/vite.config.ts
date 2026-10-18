import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// `pnpm dev` here proxies API calls to a LocalPay running on :4010.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: 'dist', assetsDir: 'assets', sourcemap: false },
  server: {
    proxy: {
      '/_localpay': 'http://127.0.0.1:4010',
      '/v1': 'http://127.0.0.1:4010',
    },
  },
});
