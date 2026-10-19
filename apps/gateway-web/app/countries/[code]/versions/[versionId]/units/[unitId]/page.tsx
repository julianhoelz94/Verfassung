import { notFound } from 'next/navigation';
import { getCountry, getReaderOutline, getUnit, getVersion, listAllUnits } from '../../../../../../../lib/api';
import { orderedTargets } from '../../../../../../../lib/ordered-content';
import { publicSnapshotContext } from '../../../../../../../lib/reading';
import { ConstitutionText } from '../../../../../../components/ConstitutionText';
import { ContentTranslationRegion } from '../../../../../../components/ContentTranslationRegion';
import { PageMain } from '../../../../../../components/PageMain';

export default async function UnitPage({ params }: { params: Promise<{ code: string; versionId: string; unitId: string }> }) {
  const { code, versionId, unitId } = await params;
  const [country, unit, outline, snapshot, roots] = await Promise.all([getCountry(code), getUnit(versionId, unitId), getReaderOutline(versionId), getVersion(versionId), listAllUnits(versionId, true)]);
  const context = publicSnapshotContext(country, snapshot);
  const constitution = context?.constitution;
  if (!constitution || !unit || unit.versionId !== versionId) notFound();
  const articlesByNumber = Object.fromEntries(roots.filter(root => root.kind === 'article' && root.articleNumber).map(root => [root.articleNumber, root.id]));
  return <PageMain><ContentTranslationRegion sourceLanguage={context?.version.languageCode ?? 'en'}><ConstitutionText article={unit} outline={outline ?? constitution.contentOutline} crossRefs={{ code, versionId, articlesByNumber, unitsByLogicalId: orderedTargets(roots) }} /></ContentTranslationRegion></PageMain>;
}
