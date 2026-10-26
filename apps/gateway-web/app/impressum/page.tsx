import { T } from '../components/TranslationProvider';
import { ui } from '../../lib/messages';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ReaderPage } from '../components/layout/templates';
import { PageHeader } from '../components/ui';
import { publicImprintDetails, publicLegalPage } from '../../lib/legal-pages';
import { currentLocale } from '../../lib/server-locale';
import { message } from '../../lib/messages';
import { Stack } from '../components/layout/Layout';

export async function generateMetadata(): Promise<Metadata> {
  return { title: `${message(await currentLocale(), ui.legal.imprint)} | Constitution Atlas`, robots: { index: false, follow: true } };
}

export default async function ImpressumPage() {
  const locale = await currentLocale();
  const localized = locale === 'en' ? await publicLegalPage('impressum_en') : null;
  const page = localized ?? await publicLegalPage('impressum');
  const details = await publicImprintDetails();
  if (!page) notFound();
  return (
    <ReaderPage width="reading" header={<PageHeader title={<T value={ui.attrs.impressumPagePageHeaderTitleImpressum} />} />}>

      {locale === 'en' && !localized ? <p>{message(locale, ui.legal.englishUnavailable)}</p> : null}
      <div className="legal-page-content" lang={localized ? 'en' : 'de'}>{page.content}</div>
      {details && page.separateContact ? <Stack as="section"  aria-label={message(locale, ui.legal.contact)}>
        <h2>{message(locale, ui.legal.contact)}</h2>
        <address>
          {details.name}<br />
          {details.streetAddress}<br />
          {details.postalCode} {details.city}<br />
          {details.country}<br />
          <a href={`mailto:${details.email}`}>{details.email}</a>
        </address>
      </Stack> : null}
    </ReaderPage>
  );
}
