'use server';

import { currentLocale } from '../../../lib/server-locale';
import { ui } from '../../../lib/messages';

import { revalidatePath } from 'next/cache';
import { readRevisionBody } from '../../../lib/amendment-form';
import {
  AmendmentApiError,
  amendmentErrorMessage,
  appendRevision,
  suggestChanges,
  type SuggestedChange,
} from '../../../lib/amendment-editor-api';

function amendmentDetailPath(id: string, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams(extra);
  const query = params.toString();
  return query ? `/editor/amendments/${encodeURIComponent(id)}?${query}` : `/editor/amendments/${encodeURIComponent(id)}`;
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
    return amendmentDetailPath(amendmentId || 'new', { error: 'invalid' });
  }
  try {
    await appendRevision(amendmentId, readRevisionBody(raw));
  } catch (error) {
    return amendmentDetailPath(amendmentId, { error: error instanceof AmendmentApiError ? error.key : 'save_failed' });
  }
  revalidatePath(amendmentDetailPath(amendmentId));
  return amendmentDetailPath(amendmentId, { saved: '1' });
}
