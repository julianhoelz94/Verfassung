import { notFound, redirect } from 'next/navigation';
import { getVersion } from '../../../../../lib/api';

export default async function UnitPermalink({ params, searchParams }: { params: Promise<{ versionId: string; unitId: string }>; searchParams: Promise<{ occurrenceId?: string }> }) {
  const { versionId, unitId } = await params;
  const { occurrenceId } = await searchParams;
  const snapshot = await getVersion(versionId);
  if (!snapshot?.countryCode || snapshot.publicationStatus !== 'published') notFound();
  const fragment = occurrenceId ? `#${encodeURIComponent(occurrenceId)}` : '';
  redirect(`/countries/${encodeURIComponent(snapshot.countryCode)}/versions/${encodeURIComponent(versionId)}/units/${encodeURIComponent(unitId)}${fragment}`);
}
