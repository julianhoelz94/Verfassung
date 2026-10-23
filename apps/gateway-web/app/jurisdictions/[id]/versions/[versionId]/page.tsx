import { notFound } from 'next/navigation';
import { ReaderPage } from '../../../../components/layout/templates';
import { PageHeader } from '../../../../components/ui';
import { OrderedContentTree } from '../../../../components/ConstitutionText';
import { T } from '../../../../components/TranslationProvider';
import { getJurisdiction, getStructuredSnapshot } from '../../../../../lib/migration-api';
import { getReaderOutline, getVersion } from '../../../../../lib/api';
import { migrationUi } from '../../../../../lib/migration-messages';

export default async function JurisdictionVersionPage({ params }: { params: Promise<{ id: string; versionId: string }> }) {
  const { id, versionId } = await params;
  const [detail, version, snapshot, outline] = await Promise.all([getJurisdiction(id), getVersion(versionId), getStructuredSnapshot(versionId), getReaderOutline(versionId)]);
  if (!detail || !version || !snapshot || version.publicationStatus !== 'published' || version.jurisdictionId !== id) notFound();
  const constitution = detail.constitutions.find(item => item.id === version.constitutionId);
  if (!constitution) notFound();
  return <ReaderPage width="content" header={<PageHeader title={`${constitution.title} · ${version.versionLabel}`} breadcrumbs={[
    { href: '/jurisdictions', label: <T value={migrationUi.jurisdictions} /> },
    ...detail.ancestors.map(item => ({ href: `/jurisdictions/${item.id}`, label: item.name })),
    { href: `/jurisdictions/${id}`, label: detail.jurisdiction.name }, { label: version.versionLabel },
  ]} />}>
    {detail.jurisdiction.historical ? <p><T value={migrationUi.historical} /></p> : null}
    <div lang={version.languageCode}><OrderedContentTree entries={snapshot.roots.map(node => ({ type: 'child', node }))} outline={outline ?? constitution.contentOutline} /></div>
  </ReaderPage>;
}
