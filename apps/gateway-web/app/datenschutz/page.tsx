import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageMain } from '../components/PageMain';
import { PageHeader } from '../components/ui';
import { publicLegalPage } from '../../lib/legal-pages';

export const metadata: Metadata = { title: 'Datenschutzerklärung | Constitution Atlas' };

export default async function DatenschutzPage() {
  const page = await publicLegalPage('datenschutz');
  if (!page) notFound();
  return (
    <PageMain>
      <PageHeader title="Datenschutzerklärung" meta={`Stand: ${new Date(page.createdAt).toLocaleDateString('de-DE')}`} />
      <div className="legal-page-content" lang="de">{page.content}</div>
    </PageMain>
  );
}
