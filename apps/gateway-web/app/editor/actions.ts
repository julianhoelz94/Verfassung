'use server';

import { redirect } from 'next/navigation';
import { openSession, publishSession, saveDraft, submitReview } from '../../lib/editor-api';

export async function openEditorAction(formData: FormData): Promise<void> {
  const versionId = String(formData.get('versionId') ?? '');
  const session = await openSession(versionId);
  redirect(`/editor?versionId=${encodeURIComponent(versionId)}&sessionId=${encodeURIComponent(session.id)}`);
}

export async function saveDraftAction(formData: FormData): Promise<void> {
  const sessionId = String(formData.get('sessionId') ?? '');
  const versionId = String(formData.get('versionId') ?? '');
  const articleId = String(formData.get('articleId') ?? '');
  const title = String(formData.get('title') ?? '');
  const body = String(formData.get('body') ?? '');
  await saveDraft(sessionId, articleId, title, body);
  redirect(
    `/editor?versionId=${encodeURIComponent(versionId)}&sessionId=${encodeURIComponent(sessionId)}&articleId=${encodeURIComponent(articleId)}&saved=1`,
  );
}

export async function reviewAction(formData: FormData): Promise<void> {
  const sessionId = String(formData.get('sessionId') ?? '');
  const versionId = String(formData.get('versionId') ?? '');
  await submitReview(sessionId);
  redirect(`/editor?versionId=${encodeURIComponent(versionId)}&sessionId=${encodeURIComponent(sessionId)}&reviewed=1`);
}

export async function publishAction(formData: FormData): Promise<void> {
  const sessionId = String(formData.get('sessionId') ?? '');
  const versionId = String(formData.get('versionId') ?? '');
  await publishSession(sessionId);
  redirect(`/editor?versionId=${encodeURIComponent(versionId)}&sessionId=${encodeURIComponent(sessionId)}&published=1`);
}
