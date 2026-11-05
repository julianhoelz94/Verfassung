'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { currentUser, requireSessionBearer } from '../../../lib/session';
import { createDocument, reviseDocument, uploadDocument } from '../../../lib/document-api';
import { safeReturnTo } from '../../../lib/return-to';

async function writer(): Promise<string> {
  const user = await currentUser();
  if (!user?.roles.some((role) => ['admin', 'editor', 'publisher'].includes(role))) {
    redirect('/editor/documents?error=forbidden');
  }
  return requireSessionBearer();
}

function safeReturnPath(value: FormDataEntryValue | null): string {
  return safeReturnTo(String(value ?? ''), '/editor/documents');
}

export async function createDocumentAction(form: FormData): Promise<string> {
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
    return `/editor/documents/new?error=save&returnTo=${encodeURIComponent(returnTo)}`;
  }
  revalidatePath('/editor/documents');
  return `/editor/documents/${document.id}?created=1&returnTo=${encodeURIComponent(returnTo)}`;
}

export async function reviseDocumentAction(form: FormData): Promise<string> {
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
    return `/editor/documents/${encodeURIComponent(id)}?error=conflict`;
  }
  revalidatePath(`/editor/documents/${id}`);
  return `/editor/documents/${encodeURIComponent(id)}?saved=1`;
}

export async function uploadDocumentAction(form: FormData): Promise<string> {
  const authorization = await writer();
  const id = String(form.get('id') ?? '');
  const file = form.get('file');
  if (!(file instanceof File)) return `/editor/documents/${encodeURIComponent(id)}?error=file`;
  try {
    await uploadDocument(id, Number(form.get('expectedRevision')), file, authorization);
  } catch {
    return `/editor/documents/${encodeURIComponent(id)}?error=file`;
  }
  revalidatePath(`/editor/documents/${id}`);
  return `/editor/documents/${encodeURIComponent(id)}?saved=1`;
}
