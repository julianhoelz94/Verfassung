import { notFound, redirect } from 'next/navigation';
import { getVersion, getUnit } from '../../../../../lib/api';

export default async function UnitPermalink({ params, searchParams }: { params: Promise<{ versionId: string; unitId: string }>; searchParams: Promise<{ occurrenceId?: string }> }) {
  const { versionId, unitId } = await params;
  const { occurrenceId } = await searchParams;
  const snapshot = await getVersion(versionId);
  if (!snapshot || snapshot.publicationStatus !== 'published') notFound();
  if (!snapshot.countryCode && snapshot.jurisdictionId) {
    if (!(await getUnit(versionId, unitId))) notFound();
    redirect(`/jurisdictions/${snapshot.jurisdictionId}/versions/${versionId}#${encodeURIComponent(occurrenceId ?? unitId)}`);
  }
  if (!snapshot.countryCode) notFound();
  const fragment = occurrenceId ? `#${encodeURIComponent(occurrenceId)}` : '';
  redirect(`/countries/${encodeURIComponent(snapshot.countryCode)}/versions/${encodeURIComponent(versionId)}/units/${encodeURIComponent(unitId)}${fragment}`);
}
