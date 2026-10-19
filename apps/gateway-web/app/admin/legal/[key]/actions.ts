'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminUser } from '../../../../lib/admin';
import { requireSessionBearer } from '../../../../lib/session';
import { publishLegalPage, saveLegalPageDraft, LegalPageWriteError, type LegalPageKey } from '../../../../lib/legal-pages';

function keyFrom(formData: FormData): LegalPageKey {
  const key = String(formData.get('key') ?? '');
  if (!['impressum', 'datenschutz', 'impressum_en', 'datenschutz_en'].includes(key)) throw new Error('Invalid legal page');
  return key as LegalPageKey;
}

export async function saveLegalDraftAction(formData: FormData): Promise<string> {
  const key = keyFrom(formData);
  await requireAdminUser(`/admin/legal/${key}?error=forbidden`);
  const bearer = await requireSessionBearer();
  try {
    const contact = key.startsWith('impressum') && formData.has('expectedContactRevision') ? {
      expectedRevision: Number(formData.get('expectedContactRevision')),
      name: String(formData.get('name') ?? '').trim(),
      streetAddress: String(formData.get('streetAddress') ?? '').trim(),
      postalCode: String(formData.get('postalCode') ?? '').trim(),
      city: String(formData.get('city') ?? '').trim(),
      country: String(formData.get('country') ?? '').trim(),
      email: String(formData.get('email') ?? '').trim(),
    } : undefined;
    await saveLegalPageDraft(key, String(formData.get('content') ?? ''), Number(formData.get('expectedRevision')), bearer, contact);
  } catch (error) {
    return `/admin/legal/${key}?error=${error instanceof LegalPageWriteError ? error.reason : 'save'}`;
  }
  return `/admin/legal/${key}?saved=1`;
}

export async function publishLegalPageAction(formData: FormData): Promise<string> {
  const key = keyFrom(formData);
  await requireAdminUser(`/admin/legal/${key}?error=forbidden`);
  const bearer = await requireSessionBearer();
  try {
    await publishLegalPage(key, Number(formData.get('expectedRevision')), bearer, key.startsWith('impressum') ? Number(formData.get('expectedContactRevision')) : undefined);
  } catch (error) {
    return `/admin/legal/${key}?error=${error instanceof LegalPageWriteError ? error.reason : 'publish'}`;
  }
  revalidatePath(key.startsWith('impressum') ? '/impressum' : '/datenschutz');
  return `/admin/legal/${key}?published=1`;
}
