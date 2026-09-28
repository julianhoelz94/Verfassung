import { NextRequest, NextResponse } from 'next/server';
import { readWriteBody } from '../../../lib/amendment-form';
import { AmendmentApiError, appendRevision, confirmAmendmentQuotes, createAmendment, publishAmendment, withdrawAmendment } from '../../../lib/amendment-editor-api';
import {
  EditorApiError,
  approveReview,
  openSession,
  publishSession,
  saveDraft,
  saveStructuredDraft,
  savePublishDetails,
  submitReview,
} from '../../../lib/editor-api';

function value(form: FormData, key: string): string {
  return String(form.get(key) ?? '').trim();
}

function editorPath(form: FormData, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams();
  for (const key of ['versionId', 'sessionId', 'articleId', 'scope', 'selectedNode']) {
    const entry = value(form, key);
    if (entry) params.set(key, entry);
  }
  for (const [key, entry] of Object.entries(extra)) params.set(key, entry);
  return `/editor?${params.toString()}`;
}

function redirectTo(request: NextRequest, path: string): NextResponse {
  const origin = request.headers.get('origin');
  if (origin) return NextResponse.redirect(new URL(path, origin), 303);
  const host = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ?? request.headers.get('host');
  const protocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ?? request.nextUrl.protocol.replace(':', '');
  return NextResponse.redirect(new URL(path, host ? `${protocol}://${host}` : request.url), 303);
}

function hasTrustedOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    const originUrl = new URL(origin);
    const host = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ?? request.headers.get('host');
    const protocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ?? request.nextUrl.protocol.replace(':', '');
    return Boolean(host) && originUrl.host === host && originUrl.protocol === `${protocol}:`;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!hasTrustedOrigin(request)) {
    return new NextResponse('Forbidden', { status: 403 });
  }
  const form = await request.formData();
  const command = request.nextUrl.searchParams.get('command') ?? value(form, 'command');
  const sessionId = value(form, 'sessionId');
  try {
    if (command === 'amendment-save') {
      const id = value(form, 'amendmentId');
      const constitutionId = value(form, 'constitutionId');
      const body = readWriteBody(form);
      if (!id || id === 'new') {
        if (!constitutionId) return redirectTo(request, '/editor/amendments?error=invalid');
        const created = await createAmendment(constitutionId, body);
        return redirectTo(request, `/editor/amendments/${encodeURIComponent(created.id)}?saved=1`);
      }
      await appendRevision(id, body);
      return redirectTo(request, `/editor/amendments/${encodeURIComponent(id)}?saved=1`);
    }
    if (command === 'amendment-withdraw') {
      const id = value(form, 'amendmentId');
      if (!id || id === 'new') return redirectTo(request, '/editor/amendments?error=invalid');
      await withdrawAmendment(id);
      return redirectTo(request, `/editor/amendments/${encodeURIComponent(id)}?withdrawn=1`);
    }
    if (command === 'amendment-publish' || command === 'amendment-confirm') {
      const id = value(form, 'amendmentId');
      if (!id || id === 'new') return redirectTo(request, '/editor/amendments?error=invalid');
      if (command === 'amendment-publish') await publishAmendment(id);
      else await confirmAmendmentQuotes(id);
      return redirectTo(request, `/editor/amendments/${encodeURIComponent(id)}?${command === 'amendment-publish' ? 'published' : 'confirmed'}=1`);
    }
    if (command === 'open') {
      const hopKind = value(form, 'hopKind');
      if (hopKind !== 'legal' && hopKind !== 'editorial_correction') {
        return redirectTo(request, '/editor?error=invalid');
      }
      const versionId = value(form, 'versionId');
      const session = await openSession(versionId, hopKind);
      return redirectTo(request, `/editor?versionId=${encodeURIComponent(versionId)}&sessionId=${encodeURIComponent(session.id)}`);
    }
    if (command === 'load') {
      if (!sessionId) return redirectTo(request, '/editor?error=session_id');
      return redirectTo(request, editorPath(form));
    }
    if (command === 'structured-save') {
      let payload;
      try { payload = JSON.parse(String(form.get('structuredDraft') ?? '')); } catch { return redirectTo(request, editorPath(form, { error: 'invalid' })); }
      if (!payload || !Number.isSafeInteger(payload.expectedGeneration) || !Array.isArray(payload.operations)) return redirectTo(request, editorPath(form, { error: 'invalid' }));
      await saveStructuredDraft(sessionId, payload);
      return redirectTo(request, editorPath(form, { saved: '1' }));
    }
    if (command === 'save') {
      await saveDraft(sessionId, value(form, 'articleId'), value(form, 'title'), value(form, 'body'));
      return redirectTo(request, editorPath(form, { saved: '1' }));
    }
    if (command === 'details') {
      const details = value(form, 'hopKind') === 'legal' ? {
        changeRecord: {
          title: value(form, 'recordTitle'),
          comment: value(form, 'recordComment'),
          documents: [{ url: value(form, 'documentUrl'), label: value(form, 'documentLabel') || undefined }],
        },
      } : { comment: value(form, 'comment') };
      await savePublishDetails(sessionId, details);
      return redirectTo(request, editorPath(form, { detailsSaved: '1' }));
    }
    if (command === 'review') {
      await submitReview(sessionId);
      return redirectTo(request, editorPath(form, { reviewed: '1' }));
    }
    if (command === 'approve') {
      await approveReview(sessionId);
      return redirectTo(request, editorPath(form, { approved: '1' }));
    }
    if (command === 'publish') {
      const hopKind = value(form, 'hopKind');
      if (hopKind !== 'legal' && hopKind !== 'editorial_correction') {
        return redirectTo(request, editorPath(form, { error: 'invalid' }));
      }
      const inlineTitle = value(form, 'recordTitle');
      const preview = await publishSession(sessionId, {
        hopKind,
        amendmentId: value(form, 'amendmentId') || undefined,
        comment: value(form, 'comment') || undefined,
        changeRecord: inlineTitle ? {
          title: inlineTitle,
          comment: value(form, 'recordComment'),
          documents: [{ url: value(form, 'documentUrl') }],
        } : undefined,
      });
      const extra: Record<string, string> = { published: '1' };
      if (preview.newVersionLabel) extra.newVersionLabel = preview.newVersionLabel;
      if (preview.newVersionId) extra.newVersionId = preview.newVersionId;
      if (hopKind === 'legal' && (preview.changeRecord?.title || inlineTitle)) {
        extra.amendmentTitle = preview.changeRecord?.title || inlineTitle;
      }
      if (preview.amendmentStatus === 'failed' || preview.amendmentStatus === 'pending') extra.amendmentPending = '1';
      return redirectTo(request, editorPath(form, extra));
    }
    return redirectTo(request, editorPath(form, { error: 'invalid' }));
  } catch (error) {
    if (error instanceof AmendmentApiError) {
      const id = value(form, 'amendmentId');
      const detail = id && id !== 'new' ? id : 'new';
      const params = new URLSearchParams({ error: error.key });
      if (detail === 'new' && value(form, 'constitutionId')) params.set('constitutionId', value(form, 'constitutionId'));
      return redirectTo(request, `/editor/amendments/${encodeURIComponent(detail)}?${params}`);
    }
    if (error instanceof EditorApiError && error.code === 'step_up_required') {
      return redirectTo(request, `/account/step-up?returnTo=${encodeURIComponent(editorPath(form))}`);
    }
    if (error instanceof EditorApiError) {
      return redirectTo(request, editorPath(form, { error: error.key }));
    }
    throw error;
  }
}
