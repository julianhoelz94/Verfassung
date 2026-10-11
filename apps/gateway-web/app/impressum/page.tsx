import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageMain } from '../components/PageMain';
import { PageHeader } from '../components/ui';
import { publicLegalPage } from '../../lib/legal-pages';

export const metadata: Metadata = {
  title: 'Impressum | Constitution Atlas',
  robots: { index: false, follow: true },
};

export default async function ImpressumPage() {
  const page = await publicLegalPage('impressum');
  if (!page) notFound();
  return (
    <PageMain>
      <PageHeader title="Impressum" />
      <div className="legal-page-content">{page.content}</div>
    </PageMain>
  );
}
