'use server';

import { redirect } from 'next/navigation';
import {
  EditorApiError,
  approveReview,
  openSession,
  publishSession,
  saveDraft,
  submitReview,
} from '../../lib/editor-api';

function editorPath(formData: FormData, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams();
  const versionId = String(formData.get('versionId') ?? '');
  const sessionId = String(formData.get('sessionId') ?? '');
  const articleId = String(formData.get('articleId') ?? '');
  if (versionId) params.set('versionId', versionId);
  if (sessionId) params.set('sessionId', sessionId);
  if (articleId) params.set('articleId', articleId);
  for (const [key, value] of Object.entries(extra)) {
    params.set(key, value);
  }
  return `/editor?${params.toString()}`;
}

function redirectEditor(formData: FormData, extra: Record<string, string> = {}): never {
  redirect(editorPath(formData, extra));
}

async function runCommand(formData: FormData, command: () => Promise<unknown>, success: Record<string, string>) {
  try {
    await command();
  } catch (error) {
    if (error instanceof EditorApiError) {
      redirectEditor(formData, { error: error.message });
    }
    throw error;
  }
  redirectEditor(formData, success);
}

export async function openEditorAction(formData: FormData): Promise<void> {
  const versionId = String(formData.get('versionId') ?? '');
  try {
    const session = await openSession(versionId);
    redirect(`/editor?versionId=${encodeURIComponent(versionId)}&sessionId=${encodeURIComponent(session.id)}`);
  } catch (error) {
    if (error instanceof EditorApiError) {
      redirect(`/editor?versionId=${encodeURIComponent(versionId)}&error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }
}

export async function loadSessionAction(formData: FormData): Promise<void> {
  const sessionId = String(formData.get('sessionId') ?? '').trim();
  const versionId = String(formData.get('versionId') ?? '');
  if (!sessionId) {
    redirect(`/editor?error=${encodeURIComponent('Enter a session id.')}`);
  }
  const params = new URLSearchParams({ sessionId });
  if (versionId) params.set('versionId', versionId);
  redirect(`/editor?${params.toString()}`);
}

export async function saveDraftAction(formData: FormData): Promise<void> {
  await runCommand(
    formData,
    () =>
      saveDraft(
        String(formData.get('sessionId') ?? ''),
        String(formData.get('articleId') ?? ''),
        String(formData.get('title') ?? ''),
        String(formData.get('body') ?? ''),
      ),
    { saved: '1' },
  );
}

export async function reviewAction(formData: FormData): Promise<void> {
  await runCommand(formData, () => submitReview(String(formData.get('sessionId') ?? '')), { reviewed: '1' });
}

export async function approveAction(formData: FormData): Promise<void> {
  await runCommand(formData, () => approveReview(String(formData.get('sessionId') ?? '')), { approved: '1' });
}

export async function publishAction(formData: FormData): Promise<void> {
  await runCommand(formData, () => publishSession(String(formData.get('sessionId') ?? '')), { published: '1' });
}
