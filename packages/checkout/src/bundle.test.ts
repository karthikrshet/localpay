import { describe, expect, it } from 'vitest';
import { buildCheckout, gzipSize, SIZE_LIMIT_GZIP_BYTES } from '../build.ts';

describe('checkout.js bundle', () => {
  it('builds to one file under the 30 KB gzip budget', async () => {
    const code = await buildCheckout();
    expect(code).toContain('TEST MODE');
    expect(code).not.toMatch(/\bimport\s*\(/);
    expect(gzipSize(code)).toBeLessThan(SIZE_LIMIT_GZIP_BYTES);
  });
});
