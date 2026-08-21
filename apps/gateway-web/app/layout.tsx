import type { ReactNode } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Constitution Atlas',
  description: 'Browse versioned constitutions',
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: 'Georgia, serif',
          lineHeight: 1.5,
          color: '#1a1a1a',
          background: '#faf8f5',
        }}
      >
        <header style={{ padding: '16px 24px', borderBottom: '1px solid #ddd' }}>
          <a href="/" style={{ color: 'inherit', textDecoration: 'none' }}>
            Constitution Atlas
          </a>
        </header>
        {children}
      </body>
    </html>
  );
}
