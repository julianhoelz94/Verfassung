import { notFound } from 'next/navigation';
import { getCountry, getReaderOutline, getUnit, getVersion, listAllUnits } from '../../../../../../../lib/api';
import { orderedTargets } from '../../../../../../../lib/ordered-content';
import { publicSnapshotContext } from '../../../../../../../lib/reading';
import { ConstitutionText } from '../../../../../../components/ConstitutionText';
import { ContentTranslationRegion } from '../../../../../../components/ContentTranslationRegion';
import { PageMain } from '../../../../../../components/PageMain';
import { PageHeader } from '../../../../../../components/ui';
import { PrintLink } from '../../../../../../components/PrintLink';
import { SnapshotNotice } from '../../../../../../components/SnapshotNotice';
import { T } from '../../../../../../components/TranslationProvider';
import { ui } from '../../../../../../../lib/messages';
import { kindByCode } from '../../../../../../../lib/outline';

export default async function UnitPage({ params }: { params: Promise<{ code: string; versionId: string; unitId: string }> }) {
  const { code, versionId, unitId } = await params;
  const [country, unit, outline, snapshot, roots] = await Promise.all([getCountry(code), getUnit(versionId, unitId), getReaderOutline(versionId), getVersion(versionId), listAllUnits(versionId, true)]);
  const context = publicSnapshotContext(country, snapshot);
  const constitution = context?.constitution;
  if (!constitution || !unit || unit.versionId !== versionId) notFound();
  const articlesByNumber = Object.fromEntries(roots.filter(root => root.kind === 'article' && root.articleNumber).map(root => [root.articleNumber, root.id]));
  const kind = kindByCode(outline ?? constitution.contentOutline, unit.kind ?? 'article')?.displayLabel ?? unit.kind;
  const title = [kind, unit.articleNumber, unit.title].filter(Boolean).join(' · ');
  return <PageMain>
    <PageHeader title={title} eyebrow={constitution.title} breadcrumbs={[
      { href: '/', label: <T value={ui.nav.countries} /> },
      { href: `/countries/${code}`, label: country!.name },
      { href: `/countries/${code}/versions/${versionId}`, label: context!.version.versionLabel },
    ]} actions={<PrintLink />} />
    <SnapshotNotice code={code} viewedId={versionId} currentId={context!.version.currentVersionId ?? context!.version.id} />
    <ContentTranslationRegion sourceLanguage={context!.version.languageCode}>
      <ConstitutionText article={unit} showHeading={false} lang={context!.version.languageCode} outline={outline ?? constitution.contentOutline} crossRefs={{ code, versionId, articlesByNumber, unitsByLogicalId: orderedTargets(roots) }} />
    </ContentTranslationRegion>
  </PageMain>;
}
