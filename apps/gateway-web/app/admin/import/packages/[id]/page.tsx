import { redirect } from 'next/navigation';
import { currentUser } from '../../../../../lib/session';
import { packageReviewHref, type ImportReviewQuery } from '../../../../../lib/import-review';
import { ImportReview } from '../../../../editor/ImportReview';
import { loginHref } from '../../../../../lib/return-to';

export default async function ImportPackagePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<ImportReviewQuery> }) {
  const { id } = await params;
  const query = await searchParams;
  if (!await currentUser()) redirect(loginHref(packageReviewHref(id), query));
  return <ImportReview runId={id} query={query} />;
}
