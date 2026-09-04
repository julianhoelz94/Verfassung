import './globals.css';
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
      <body>
        <header className="site-header">
          <a className="site-brand" href="/">
            Constitution Atlas
          </a>
          <nav className="site-nav" aria-label="Primary">
            <a href="/">Countries</a>
            <a href="/search">Search</a>
          </nav>
          <form className="header-search" action="/search" method="get">
            <input type="search" name="q" placeholder="Search articles" aria-label="Search articles" />
            <button type="submit">Search</button>
          </form>
          <span style={{ flex: 1 }} />
          {user ? (
            <>
              <a href="/editor">Editor</a>
              <span className="muted">{user.email}</span>
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
