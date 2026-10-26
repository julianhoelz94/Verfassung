import { T } from '../components/TranslationProvider';
import { ui } from '../../lib/messages';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ReaderPage } from '../components/layout/templates';
import { PageHeader } from '../components/ui';
import { publicLegalPage } from '../../lib/legal-pages';
import { currentLocale } from '../../lib/server-locale';
import { message } from '../../lib/messages';

export async function generateMetadata(): Promise<Metadata> {
  return { title: `${message(await currentLocale(), ui.legal.privacyNotice)} | Constitution Atlas` };
}

export default async function DatenschutzPage() {
  const locale = await currentLocale();
  const localized = locale === 'en' ? await publicLegalPage('datenschutz_en') : null;
  const page = localized ?? await publicLegalPage('datenschutz');
  if (!page) notFound();
  return (
    <ReaderPage width="reading" header={<PageHeader title={<T value={ui.attrs.datenschutzPagePageHeaderTitleDatenschutzerklaRung} />} meta={new Date(page.createdAt).toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-US')} />}>

      {locale === 'en' && !localized ? <p>{message(locale, ui.legal.englishUnavailable)}</p> : null}
      <div className="legal-page-content" lang={localized ? 'en' : 'de'}>{page.content}</div>
    </ReaderPage>
  );
}
