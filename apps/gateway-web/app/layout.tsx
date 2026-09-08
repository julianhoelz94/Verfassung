import './globals.css';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { publicBaseUrl } from '../lib/site-url';
import { currentSession } from '../lib/session';
import { SiteFooter } from './components/SiteFooter';
import { SiteHeader } from './components/SiteHeader';

export async function generateMetadata(): Promise<Metadata> {
  const base = publicBaseUrl();
  return {
    metadataBase: new URL(base),
    title: 'Constitution Atlas',
    description: 'Browse versioned constitutions',
    openGraph: {
      title: 'Constitution Atlas',
      description: 'Browse versioned constitutions',
    },
  };
}

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
        <SiteFooter />
      </body>
    </html>
  );
}
