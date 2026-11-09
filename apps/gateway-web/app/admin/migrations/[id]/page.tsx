import { redirect } from 'next/navigation';
import { packageReviewHref, type ImportReviewQuery } from '../../../../lib/import-review';

/** Preserve existing MCP links while the review surface lives in Imports. */
export default async function MigrationReviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<ImportReviewQuery> }) {
  const { id } = await params;
  const query = await searchParams;
  redirect(packageReviewHref(id, query.item, Object.fromEntries(Object.entries(query).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))));
}
