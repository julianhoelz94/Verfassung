import { notFound } from 'next/navigation';
import { getCountry, getReaderOutline, getUnit, getVersion, listAllUnits } from '../../../../../../../lib/api';
import { orderedTargets } from '../../../../../../../lib/ordered-content';
import { publicSnapshotContext } from '../../../../../../../lib/reading';
import { ConstitutionText } from '../../../../../../components/ConstitutionText';
import { PageMain } from '../../../../../../components/PageMain';

export default async function UnitPage({ params }: { params: Promise<{ code: string; versionId: string; unitId: string }> }) {
  const { code, versionId, unitId } = await params;
  const [country, unit, outline, snapshot, roots] = await Promise.all([getCountry(code), getUnit(versionId, unitId), getReaderOutline(versionId), getVersion(versionId), listAllUnits(versionId, true)]);
  const constitution = publicSnapshotContext(country, snapshot)?.constitution;
  if (!constitution || !unit || unit.versionId !== versionId) notFound();
  return <PageMain><ConstitutionText article={unit} outline={outline ?? constitution.contentOutline} crossRefs={{ code, versionId, articlesByNumber: {}, unitsByLogicalId: orderedTargets(roots) }} /></PageMain>;
}
