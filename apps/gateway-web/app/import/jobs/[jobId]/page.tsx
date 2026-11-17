import { redirect } from 'next/navigation';
import { currentUser } from '../../../../lib/session';
import { loginHref } from '../../../../lib/return-to';
import { importJobHref } from '../../../../lib/import-routes';
import type { ImportReviewQuery } from '../../../../lib/import-review';
import { ImportReview } from '../../../editor/ImportReview';
export default async function ImportJobPage({ params, searchParams }: { params: Promise<{ jobId: string }>; searchParams: Promise<ImportReviewQuery & { inbox?: string }> }) {
  const { jobId } = await params, query = await searchParams;
  if (!await currentUser()) redirect(loginHref(importJobHref(jobId), query));
  return <ImportReview jobId={jobId} query={query} error={query.error} inboxReturnTo={query.inbox} />;
}
