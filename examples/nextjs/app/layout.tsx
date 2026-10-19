import type { ReactNode } from 'react';

export const metadata = { title: 'LocalPay Next.js example' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ font: '16px system-ui, sans-serif', maxWidth: '32rem', margin: '3rem auto', padding: '0 1rem', color: '#0F172A' }}>{children}</body>
    </html>
  );
}
