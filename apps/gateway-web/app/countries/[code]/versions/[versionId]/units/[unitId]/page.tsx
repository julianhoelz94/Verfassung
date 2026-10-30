import { notFound } from 'next/navigation';
import { getUnit } from '../../../../../../../lib/api';
import { CountryConstitutionReader } from '../../CountryConstitutionReader';
import { ReaderPage } from '../../../../../../components/layout/templates';
import { ServiceUnavailable } from '../../../../../../components/StatusMessage';
import { ui } from '../../../../../../../lib/messages';

export default async function UnitPage({ params }: { params: Promise<{ code: string; versionId: string; unitId: string }> }) {
  const { code, versionId, unitId } = await params;
  let unit;
  try { unit = await getUnit(versionId, unitId); }
  catch { return <ReaderPage width="content"><ServiceUnavailable service={ui.services.content} retryHref={`/countries/${code}/versions/${versionId}/units/${unitId}`} /></ReaderPage>; }
  if (!unit || unit.versionId !== versionId) notFound();
  return CountryConstitutionReader({ code, versionId,
    initialPassage: { id: unit.id, legacyId: `article-${unit.articleNumber}` } });
}
