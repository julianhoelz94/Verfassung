'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdminUser } from '../../../../lib/admin';
import { requireSessionBearer } from '../../../../lib/session';
import { publishLegalPage, saveLegalPageDraft, saveImprintDetails, publishImprintDetails, type LegalPageKey } from '../../../../lib/legal-pages';

function keyFrom(formData: FormData): LegalPageKey {
  const key = String(formData.get('key') ?? '');
  if (!['impressum', 'datenschutz', 'impressum_en', 'datenschutz_en'].includes(key)) throw new Error('Invalid legal page');
  return key as LegalPageKey;
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

export async function saveImprintDetailsAction(formData: FormData): Promise<void> {
  await requireAdminUser('/admin/legal/impressum?error=forbidden');
  const bearer = await requireSessionBearer();
  try {
    await saveImprintDetails({
      name: String(formData.get('name') ?? ''),
      streetAddress: String(formData.get('streetAddress') ?? ''),
      postalCode: String(formData.get('postalCode') ?? ''),
      city: String(formData.get('city') ?? ''),
      country: String(formData.get('country') ?? ''),
      email: String(formData.get('email') ?? ''),
    }, Number(formData.get('expectedRevision')), bearer);
  } catch {
    redirect('/admin/legal/impressum?error=details');
  }
  redirect('/admin/legal/impressum?saved=1');
}

export async function publishImprintDetailsAction(formData: FormData): Promise<void> {
  await requireAdminUser('/admin/legal/impressum?error=forbidden');
  const bearer = await requireSessionBearer();
  try {
    await publishImprintDetails(Number(formData.get('expectedRevision')), bearer);
  } catch {
    redirect('/admin/legal/impressum?error=details');
  }
  revalidatePath('/impressum');
  redirect('/admin/legal/impressum?published=1');
}
