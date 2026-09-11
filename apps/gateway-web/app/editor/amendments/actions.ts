'use server';

import { redirect } from 'next/navigation';
import {
  AmendmentApiError,
  amendmentErrorMessage,
  appendRevision,
  createAmendment,
  publishAmendment,
  suggestChanges,
  withdrawAmendment,
  type AmendmentChangeWrite,
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

function optionalField(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? '').trim();
  return value || null;
}

function parseChanges(formData: FormData): AmendmentChangeWrite[] {
  const raw = String(formData.get('changesJson') ?? '[]');
  try {
    const parsed = JSON.parse(raw) as AmendmentChangeWrite[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((change) => ({
      articleNumber: change.articleNumber?.trim() || null,
      changeType: change.changeType,
      note: change.note?.trim() || null,
    }));
  } catch {
    return [];
  }
}

function readWriteBody(formData: FormData): AmendmentWriteBody {
  const title = String(formData.get('title') ?? '').trim();
  if (!title) {
    throw new AmendmentApiError('title');
  }
  return {
    kind: String(formData.get('kind') ?? 'legal_amendment'),
    title,
    summary: optionalField(formData, 'summary'),
    enactedOn: optionalField(formData, 'enactedOn'),
    effectiveOn: optionalField(formData, 'effectiveOn'),
    sourceReference: optionalField(formData, 'sourceReference'),
    sourceVersionId: optionalField(formData, 'sourceVersionId'),
    targetVersionId: optionalField(formData, 'targetVersionId'),
    changes: parseChanges(formData),
  };
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
  redirectDetail(amendmentId, success);
}

export async function saveAmendmentAction(formData: FormData): Promise<void> {
  const amendmentId = String(formData.get('amendmentId') ?? '').trim();
  const constitutionId = String(formData.get('constitutionId') ?? '').trim();
  try {
    const body = readWriteBody(formData);
    if (!amendmentId || amendmentId === 'new') {
      if (!constitutionId) {
        redirect(amendmentListPath({ error: 'invalid' }));
      }
      const created = await createAmendment(constitutionId, body);
      redirectDetail(created.id, { saved: '1' });
    }
    await runDetailCommand(formData, amendmentId, () => appendRevision(amendmentId, body), { saved: '1' });
  } catch (error) {
    if (error instanceof AmendmentApiError) {
      if (!amendmentId || amendmentId === 'new') {
        redirect(
          amendmentDetailPath('new', {
            constitutionId,
            error: error.key,
          }),
        );
      }
      redirectDetail(amendmentId, { error: error.key });
    }
    throw error;
  }
}

export async function publishAmendmentAction(formData: FormData): Promise<void> {
  const amendmentId = String(formData.get('amendmentId') ?? '').trim();
  if (!amendmentId || amendmentId === 'new') {
    redirect(amendmentListPath({ error: 'invalid' }));
  }
  await runDetailCommand(formData, amendmentId, () => publishAmendment(amendmentId), { published: '1' });
}

export async function withdrawAmendmentAction(formData: FormData): Promise<void> {
  const amendmentId = String(formData.get('amendmentId') ?? '').trim();
  if (!amendmentId || amendmentId === 'new') {
    redirect(amendmentListPath({ error: 'invalid' }));
  }
  await runDetailCommand(formData, amendmentId, () => withdrawAmendment(amendmentId), { withdrawn: '1' });
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
    kind: revision.kind ?? 'legal_amendment',
    title: revision.title,
    summary: revision.summary ?? null,
    enactedOn: revision.enactedOn ?? null,
    effectiveOn: revision.effectiveOn ?? null,
    sourceReference: revision.sourceReference ?? null,
    sourceVersionId: revision.sourceVersionId ?? null,
    targetVersionId: revision.targetVersionId ?? null,
    changes: revision.changes.map((change) => ({
      articleNumber: change.articleNumber?.trim() || null,
      changeType: change.changeType,
      note: change.note?.trim() || null,
    })),
  };
  await runDetailCommand(formData, amendmentId, () => appendRevision(amendmentId, body), { saved: '1' });
}
