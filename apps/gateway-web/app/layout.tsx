import './globals.css';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { currentSession } from '../lib/session';
import { SiteHeader } from './components/SiteHeader';

export const metadata: Metadata = {
  title: 'Constitution Atlas',
  description: 'Browse versioned constitutions',
};

type RootLayoutProps = {
  children: ReactNode;
};

export default async function RootLayout({ children }: RootLayoutProps) {
  const session = await currentSession();
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <SiteHeader user={session.user} identityUnavailable={session.identityUnavailable} />
        {children}
      </body>
    </html>
  );
}
