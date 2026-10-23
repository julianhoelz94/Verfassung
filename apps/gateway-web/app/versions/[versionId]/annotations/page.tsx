import { notFound } from 'next/navigation';
import { CollectionPage } from '../../../components/layout/templates';
import { PageHeader } from '../../../components/ui';
import { T } from '../../../components/TranslationProvider';
import { OrderedContentTree } from '../../../components/ConstitutionText';
import { getVersion, type OrderedEntry } from '../../../../lib/api';
import { getStructuredSnapshot } from '../../../../lib/migration-api';
import { migrationUi } from '../../../../lib/migration-messages';

export default async function AnnotationsPage({ params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  const [version, snapshot] = await Promise.all([getVersion(versionId), getStructuredSnapshot(versionId)]);
  if (!version || version.publicationStatus !== 'published' || !snapshot) notFound();
  const notes: OrderedEntry[] = [];
  function collect(entries: OrderedEntry[]) { for (const entry of entries) { if (entry.format === 'footnote') notes.push(entry); if (entry.node) collect(entry.node.content); } }
  snapshot.roots.forEach(root => collect(root.content));
  const href = version.countryCode ? `/countries/${version.countryCode}/versions/${versionId}` : `/jurisdictions/${version.jurisdictionId}/versions/${versionId}`;
  return <CollectionPage width="content" header={<PageHeader title={<T value={migrationUi.annotations} />} />}>
    <p><a href={href}><T value={migrationUi.fullText} /></a></p>
    <OrderedContentTree entries={notes} />
  </CollectionPage>;
}
