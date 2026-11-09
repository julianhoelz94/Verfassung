import { redirect } from 'next/navigation';
import { currentUser } from '../../../../../lib/session';
import { packageReviewHref, type ImportReviewQuery } from '../../../../../lib/import-review';
import { ImportReview } from '../../../../editor/ImportReview';

export default async function ImportPackagePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<ImportReviewQuery> }) {
  const { id } = await params;
  if (!await currentUser()) redirect(`/login?returnTo=${encodeURIComponent(packageReviewHref(id))}`);
  return <ImportReview runId={id} query={await searchParams} />;
}
