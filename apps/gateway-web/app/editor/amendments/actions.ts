'use server';

import { currentLocale } from '../../../lib/server-locale';
import { ui } from '../../../lib/messages';

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

function redirectDetail(id: string, extra: Record<string, string> = {}): never {
  redirect(amendmentDetailPath(id, extra));
}

export async function suggestChangesAction(
  sourceVersionId: string,
  targetVersionId: string,
): Promise<{ changes: SuggestedChange[] } | { error: string }> {
  try {
    return await suggestChanges({ sourceVersionId, targetVersionId });
  } catch (error) {
    if (error instanceof AmendmentApiError) {
      return { error: amendmentErrorMessage(error.key, await currentLocale()) ?? ui.errors.suggestChangesFailed[await currentLocale()] };
    }
    return { error: ui.errors.suggestChangesFailed[await currentLocale()] };
  }
}

export async function restoreRevisionAction(formData: FormData): Promise<string> {
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
      beforeRef: change.beforeRef ?? null,
      afterRef: change.afterRef ?? null,
      linkReviewReason: change.linkReviewReason ?? null,
    })),
  };
  try {
    await appendRevision(amendmentId, body);
  } catch (error) {
    return amendmentDetailPath(amendmentId, { error: error instanceof AmendmentApiError ? error.key : 'save_failed' });
  }
  revalidatePath(amendmentDetailPath(amendmentId));
  return amendmentDetailPath(amendmentId, { saved: '1' });
}
