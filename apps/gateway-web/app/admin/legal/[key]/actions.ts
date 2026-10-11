'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdminUser } from '../../../../lib/admin';
import { requireSessionBearer } from '../../../../lib/session';
import { publishLegalPage, saveLegalPageDraft, type LegalPageKey } from '../../../../lib/legal-pages';

function keyFrom(formData: FormData): LegalPageKey {
  const key = String(formData.get('key') ?? '');
  if (key !== 'impressum' && key !== 'datenschutz') throw new Error('Invalid legal page');
  return key;
}

export async function saveLegalDraftAction(formData: FormData): Promise<void> {
  const key = keyFrom(formData);
  await requireAdminUser(`/admin/legal/${key}?error=forbidden`);
  const bearer = await requireSessionBearer();
  try {
    await saveLegalPageDraft(key, String(formData.get('content') ?? ''), Number(formData.get('expectedRevision')), bearer);
  } catch {
    redirect(`/admin/legal/${key}?error=save`);
  }
  revalidatePath(`/admin/legal/${key}`);
  redirect(`/admin/legal/${key}?saved=1`);
}

export async function publishLegalPageAction(formData: FormData): Promise<void> {
  const key = keyFrom(formData);
  await requireAdminUser(`/admin/legal/${key}?error=forbidden`);
  const bearer = await requireSessionBearer();
  try {
    await publishLegalPage(key, Number(formData.get('expectedRevision')), bearer);
  } catch {
    redirect(`/admin/legal/${key}?error=publish`);
  }
  revalidatePath(`/${key}`);
  revalidatePath(`/admin/legal/${key}`);
  redirect(`/admin/legal/${key}?published=1`);
}
