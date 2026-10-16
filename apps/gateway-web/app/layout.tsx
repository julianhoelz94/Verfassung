import './globals.css';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { publicBaseUrl } from '../lib/site-url';
import { currentSession, SESSION_COOKIE } from '../lib/session';
import { cookies, headers } from 'next/headers';
import { getCountry, listConstitutionAmendments, listCountries } from '../lib/api';
import { SiteFooter } from './components/SiteFooter';
import { SiteHeader } from './components/SiteHeader';
import { requestAnonymousBrowsingPolicy } from '../lib/anonymous-browsing-policy';
import { resolveLocale } from '../lib/locale';
import { message, ui } from '../lib/messages';
import { TranslationProvider } from './components/TranslationProvider';

export async function generateMetadata(): Promise<Metadata> {
  const base = publicBaseUrl();
  const session = await currentSession();
  const locale = resolveLocale(session.user?.languagePreference, (await headers()).get('accept-language'));
  const description = message(locale, ui.shell.siteDescription);
  return {
    metadataBase: new URL(base),
    title: 'Constitution Atlas',
    description,
    openGraph: {
      title: 'Constitution Atlas',
      description,
    },
  };
}

type RootLayoutProps = {
  children: ReactNode;
};

export default async function RootLayout({ children }: RootLayoutProps) {
  const session = await currentSession();
  const locale = resolveLocale(session.user?.languagePreference, (await headers()).get('accept-language'));
  const anonymousBrowsingAllowed = session.user ? true : (await requestAnonymousBrowsingPolicy().catch(() => null))?.allowed === true;
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
    <html lang={locale}>
      <body>
        <TranslationProvider locale={locale}>
        <a className="skip-link" href="#main-content">
          {message(locale, ui.shell.skipToMain)}
        </a>
        <SiteHeader user={session.user} identityUnavailable={session.identityUnavailable} needsReviewCount={needsReviewCount} anonymousBrowsingAllowed={anonymousBrowsingAllowed} />
        {children}
        <SiteFooter />
        </TranslationProvider>
      </body>
    </html>
  );
}
