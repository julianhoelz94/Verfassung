import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { currentUser } from '../lib/session';
import { logoutAction } from './login/actions';

export const metadata: Metadata = {
  title: 'Constitution Atlas',
  description: 'Browse versioned constitutions',
};

type RootLayoutProps = {
  children: ReactNode;
};

export default async function RootLayout({ children }: RootLayoutProps) {
  const user = await currentUser();
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
        <header
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid #ddd',
            display: 'flex',
            gap: 16,
            alignItems: 'center',
          }}
        >
          <a href="/" style={{ color: 'inherit', textDecoration: 'none' }}>
            Constitution Atlas
          </a>
          <a href="/search">Search</a>
          <form action="/search" method="get" style={{ display: 'flex', gap: 8 }}>
            <input type="search" name="q" placeholder="Search articles" aria-label="Search articles" />
            <button type="submit">Search</button>
          </form>
          <span style={{ flex: 1 }} />
          {user ? (
            <>
              <a href="/editor">Editor</a>
              <span>{user.email}</span>
              <form action={logoutAction}>
                <button type="submit">Sign out</button>
              </form>
            </>
          ) : (
            <a href="/login">Editor login</a>
          )}
        </header>
        {children}
      </body>
    </html>
  );
}
