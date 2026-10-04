'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { currentUser, requireSessionBearer } from '../../../lib/session';
import { attachDocument, createDocument, detachDocument, reviseDocument, uploadDocument } from '../../../lib/document-api';

async function writer(): Promise<string> {
  const user = await currentUser();
  if (!user?.roles.some((role) => ['admin', 'editor', 'publisher'].includes(role))) {
    redirect('/editor/documents?error=forbidden');
  }
  return requireSessionBearer();
}

function safeReturnPath(value: FormDataEntryValue | null): string {
  const path = String(value ?? '/editor/documents');
  return path.startsWith('/') && !path.startsWith('//') && !path.includes('\\') ? path : '/editor/documents';
}

export async function createDocumentAction(form: FormData): Promise<void> {
  const authorization = await writer();
  const returnTo = safeReturnPath(form.get('returnTo'));
  let document;
  try {
    document = await createDocument({
      title: String(form.get('title') ?? ''),
      description: String(form.get('description') ?? ''),
      sourceUrl: String(form.get('sourceUrl') ?? ''),
    }, authorization);
  } catch {
    redirect(`/editor/documents/new?error=save&returnTo=${encodeURIComponent(returnTo)}`);
  }
  revalidatePath('/editor/documents');
  redirect(`/editor/documents/${document.id}?created=1&returnTo=${encodeURIComponent(returnTo)}`);
}

export async function reviseDocumentAction(form: FormData): Promise<void> {
  const authorization = await writer();
  const id = String(form.get('id') ?? '');
  try {
    await reviseDocument(id, {
      title: String(form.get('title') ?? ''),
      description: String(form.get('description') ?? ''),
      sourceUrl: String(form.get('sourceUrl') ?? ''),
      expectedRevision: Number(form.get('expectedRevision')),
    }, authorization);
  } catch {
    redirect(`/editor/documents/${encodeURIComponent(id)}?error=conflict`);
  }
  revalidatePath(`/editor/documents/${id}`);
  redirect(`/editor/documents/${encodeURIComponent(id)}?saved=1`);
}

export async function uploadDocumentAction(form: FormData): Promise<void> {
  const authorization = await writer();
  const id = String(form.get('id') ?? '');
  const file = form.get('file');
  if (!(file instanceof File)) redirect(`/editor/documents/${encodeURIComponent(id)}?error=file`);
  try {
    await uploadDocument(id, Number(form.get('expectedRevision')), file, authorization);
  } catch {
    redirect(`/editor/documents/${encodeURIComponent(id)}?error=file`);
  }
  revalidatePath(`/editor/documents/${id}`);
  redirect(`/editor/documents/${encodeURIComponent(id)}?saved=1`);
}

export async function attachDocumentAction(form: FormData): Promise<void> {
  const authorization = await writer();
  const targetType = String(form.get('targetType')) as 'constitution' | 'version' | 'amendment';
  const targetId = String(form.get('targetId'));
  const returnTo = safeReturnPath(form.get('returnTo'));
  try {
    await attachDocument(targetType, targetId, String(form.get('documentId')), String(form.get('revisionId') || '') || null, authorization, String(form.get('scopeRevisionId') || '') || null);
  } catch {
    redirect(`${returnTo}${returnTo.includes('?') ? '&' : '?'}documentError=attach`);
  }
  revalidatePath(returnTo.split('?')[0]);
  redirect(returnTo);
}

export async function detachDocumentAction(form: FormData): Promise<void> {
  const authorization = await writer();
  const targetType = String(form.get('targetType')) as 'constitution' | 'version' | 'amendment';
  const targetId = String(form.get('targetId'));
  const returnTo = safeReturnPath(form.get('returnTo'));
  try {
    await detachDocument(targetType, targetId, String(form.get('documentId')), authorization, String(form.get('scopeRevisionId') || '') || null);
  } catch {
    redirect(`${returnTo}${returnTo.includes('?') ? '&' : '?'}documentError=detach`);
  }
  revalidatePath(returnTo.split('?')[0]);
  redirect(returnTo);
}
