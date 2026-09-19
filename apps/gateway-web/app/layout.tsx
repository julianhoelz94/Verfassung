import './globals.css';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { publicBaseUrl } from '../lib/site-url';
import { currentSession, SESSION_COOKIE } from '../lib/session';
import { cookies } from 'next/headers';
import { getCountry, listConstitutionAmendments, listCountries } from '../lib/api';
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
  let needsReviewCount = 0;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (session.user && token && session.user.roles.some((role) => ['admin', 'editor', 'reviewer', 'publisher'].includes(role))) {
    try {
      const countries = (await listCountries()) ?? [];
      const details = await Promise.all(countries.map((country) => getCountry(country.isoCode)));
      const records = await Promise.all(
        details.flatMap((country) => country?.constitutions ?? []).map((constitution) =>
          listConstitutionAmendments(constitution.id, {
            status: 'all', reviewStatus: 'needs_review', authorization: `Bearer ${token}`,
          }),
        ),
      );
      needsReviewCount = records.reduce((total, amendments) => total + (amendments?.length ?? 0), 0);
    } catch {
      needsReviewCount = 0;
    }
  }
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <SiteHeader user={session.user} identityUnavailable={session.identityUnavailable} needsReviewCount={needsReviewCount} />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
