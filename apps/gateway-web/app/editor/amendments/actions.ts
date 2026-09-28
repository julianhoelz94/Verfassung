'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  AmendmentApiError,
  amendmentErrorMessage,
  appendRevision,
  suggestChanges,
  type AmendmentRevision,
  type AmendmentWriteBody,
  type SuggestedChange,
} from '../../../lib/amendment-editor-api';

function amendmentDetailPath(id: string, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams(extra);
  const query = params.toString();
  return query ? `/editor/amendments/${encodeURIComponent(id)}?${query}` : `/editor/amendments/${encodeURIComponent(id)}`;
}

function amendmentListPath(extra: Record<string, string> = {}): string {
  const params = new URLSearchParams(extra);
  const query = params.toString();
  return query ? `/editor/amendments?${query}` : '/editor/amendments';
}

function redirectDetail(id: string, extra: Record<string, string> = {}): never {
  redirect(amendmentDetailPath(id, extra));
}

async function runDetailCommand(
  formData: FormData,
  amendmentId: string,
  command: () => Promise<unknown>,
  success: Record<string, string>,
): Promise<void> {
  try {
    await command();
  } catch (error) {
    if (error instanceof AmendmentApiError) {
      redirectDetail(amendmentId, { error: error.key });
    }
    throw error;
  }
  // Refresh the current detail before a query-only redirect after a mutation.
  revalidatePath(amendmentDetailPath(amendmentId));
  redirectDetail(amendmentId, success);
}

export async function suggestChangesAction(
  sourceVersionId: string,
  targetVersionId: string,
): Promise<{ changes: SuggestedChange[] } | { error: string }> {
  try {
    return await suggestChanges({ sourceVersionId, targetVersionId });
  } catch (error) {
    if (error instanceof AmendmentApiError) {
      return { error: amendmentErrorMessage(error.key) ?? 'Could not suggest changes.' };
    }
    return { error: 'Could not suggest changes.' };
  }
}

export async function restoreRevisionAction(formData: FormData): Promise<void> {
  const amendmentId = String(formData.get('amendmentId') ?? '').trim();
  const raw = String(formData.get('revisionBody') ?? '');
  if (!amendmentId || !raw) {
    redirectDetail(amendmentId || 'new', { error: 'invalid' });
  }
  let revision: AmendmentRevision;
  try {
    revision = JSON.parse(raw) as AmendmentRevision;
  } catch {
    redirectDetail(amendmentId, { error: 'invalid' });
  }
  const body: AmendmentWriteBody = {
    title: revision.title,
    summary: revision.summary ?? null,
    enactedOn: revision.enactedOn ?? null,
    effectiveOn: revision.effectiveOn ?? null,
    sourceReference: revision.sourceReference ?? null,
    sourceVersionId: revision.sourceVersionId ?? null,
    targetVersionId: revision.targetVersionId ?? null,
    comment: revision.comment ?? null,
    documents: revision.documents ?? [],
    changes: revision.changes.map((change) => ({
      articleNumber: change.articleNumber?.trim() || null,
      changeType: change.changeType,
      note: change.note?.trim() || null,
    })),
  };
  await runDetailCommand(formData, amendmentId, () => appendRevision(amendmentId, body), { saved: '1' });
}
