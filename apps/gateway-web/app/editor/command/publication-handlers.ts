import type { NextResponse } from 'next/server';
import { approveReview, publishSession, savePublishDetails, submitReview, type DraftPreview } from '../../../lib/editor-api';
import { readPublishChanges } from '../../../lib/publish-details';
import { editorPath, redirectTo, value, type CommandContext } from './request';

/** Legal change-record details and editorial correction comments remain separate payloads. */
export async function details({ request, form, sessionId }: CommandContext): Promise<NextResponse> {
  const body = value(form, 'hopKind') === 'legal' ? {
    changeRecord: {
      title: value(form, 'recordTitle'),
      comment: value(form, 'recordComment'),
      documents: [{ url: value(form, 'documentUrl'), label: value(form, 'documentLabel') || undefined }],
      changes: readPublishChanges(String(form.get('changesJson') ?? '[]')),
    },
  } : { comment: value(form, 'comment') };
  await savePublishDetails(sessionId, body);
  return redirectTo(request, editorPath(form, { detailsSaved: '1' }));
}

/** Review pins the optional source revision without also approving or publishing the session. */
export async function review({ request, form, sessionId, sourceEvidenceRevision }: CommandContext): Promise<NextResponse> {
  await submitReview(sessionId, sourceEvidenceRevision);
  return redirectTo(request, editorPath(form, { reviewed: '1' }));
}

/** Approval keeps the same source-revision pin and remains distinct from publication. */
export async function approve({ request, form, sessionId, sourceEvidenceRevision }: CommandContext): Promise<NextResponse> {
  await approveReview(sessionId, sourceEvidenceRevision);
  return redirectTo(request, editorPath(form, { approved: '1' }));
}

/** Always validates changes JSON, including correction forms without an inline record title. */
export async function publish({ request, form, sessionId, sourceEvidenceRevision }: CommandContext): Promise<NextResponse> {
  const hopKind = value(form, 'hopKind');
  if (hopKind !== 'legal' && hopKind !== 'editorial_correction') return redirectTo(request, editorPath(form, { error: 'invalid' }));
  const inlineTitle = value(form, 'recordTitle');
  const normalizedChanges = readPublishChanges(String(form.get('changesJson') ?? '[]'));
  const preview = await publishSession(sessionId, {
    hopKind, sourceEvidenceRevision,
    amendmentId: value(form, 'amendmentId') || undefined,
    comment: value(form, 'comment') || undefined,
    changeRecord: inlineTitle ? {
      title: inlineTitle,
      comment: value(form, 'recordComment'),
      documents: [{ url: value(form, 'documentUrl') }],
      changes: normalizedChanges,
    } : undefined,
  });
  return redirectTo(request, editorPath(form, publicationOutcome(preview, hopKind, inlineTitle)));
}

/** The persisted publication response takes precedence over inline metadata in native outcome links. */
function publicationOutcome(preview: DraftPreview, hopKind: 'legal' | 'editorial_correction', inlineTitle: string): Record<string, string> {
  const extra: Record<string, string> = { published: '1' };
  if (preview.newVersionLabel) extra.newVersionLabel = preview.newVersionLabel;
  if (preview.newVersionId) extra.newVersionId = preview.newVersionId;
  if (hopKind === 'legal' && (preview.changeRecord?.title || inlineTitle)) extra.amendmentTitle = preview.changeRecord?.title || inlineTitle;
  if (preview.amendmentStatus === 'failed' || preview.amendmentStatus === 'pending') extra.amendmentPending = '1';
  return extra;
}
