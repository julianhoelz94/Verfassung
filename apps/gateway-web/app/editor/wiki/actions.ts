'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { publishWikiPage, saveWikiDraft, type WikiImage } from '../../../lib/api';
import { attachDocument, createDocument, getDocument, uploadDocument } from '../../../lib/document-api';
import { requireSessionBearer } from '../../../lib/session';

function target(form: FormData) {
  const targetType = String(form.get('targetType'));
  const targetId = String(form.get('targetId'));
  const code = String(form.get('code'));
  if ((targetType !== 'country' && targetType !== 'constitution') || !/^[0-9a-f-]{36}$/i.test(targetId) || !/^[A-Za-z]{2}$/.test(code)) {
    throw new Error('Invalid wiki target');
  }
  return { targetType, targetId, code } as { targetType: 'country' | 'constitution'; targetId: string; code: string };
}

function editHref(targetType: string, targetId: string, code: string, status: string) {
  return `/editor/wiki/${targetType}/${targetId}?code=${encodeURIComponent(code)}&${status}=1`;
}

export async function saveWikiAction(form: FormData) {
  const { targetType, targetId, code } = target(form);
  const authorization = await requireSessionBearer();
  try {
    const images = (JSON.parse(String(form.get('images') ?? '[]')) as WikiImage[])
      .filter((image) => form.get(`remove-${image.documentId}`) !== 'on')
      .map((image, index) => ({
        image: {
          ...image,
          alt: String(form.get(`alt-${image.documentId}`) ?? image.alt).trim(),
          caption: String(form.get(`caption-${image.documentId}`) ?? image.caption ?? '').trim() || null,
          credit: String(form.get(`credit-${image.documentId}`) ?? image.credit ?? '').trim() || null,
          rights: String(form.get(`rights-${image.documentId}`) ?? image.rights ?? '').trim() || null,
          sourceUrl: String(form.get(`source-${image.documentId}`) ?? image.sourceUrl ?? '').trim() || null,
        },
        order: Number(form.get(`order-${image.documentId}`) ?? index + 1),
      }))
      .sort((a, b) => a.order - b.order)
      .map((item) => item.image);
    const file = form.get('imageFile');
    if (file instanceof File && file.size > 0) {
      const alt = String(form.get('imageAlt') ?? '').trim();
      if (!alt) throw new Error('Image alt text is required');
      const doc = await createDocument({ title: file.name }, authorization);
      const uploaded = await uploadDocument(doc.id, doc.currentRevision, file, authorization);
      images.push({
        documentId: uploaded.id,
        revision: uploaded.currentRevision,
        alt,
        caption: String(form.get('imageCaption') ?? '').trim() || null,
        credit: String(form.get('imageCredit') ?? '').trim() || null,
        rights: String(form.get('imageRights') ?? '').trim() || null,
        sourceUrl: String(form.get('imageSource') ?? '').trim() || null,
      });
    }
    const draft = await saveWikiDraft(targetType, targetId, {
      expectedRevisionId: String(form.get('expectedRevisionId') || '') || null,
      summary: String(form.get('summary') ?? ''),
      body: String(form.get('body') ?? ''),
      images,
      sourceUrls: String(form.get('sourceUrls') ?? '').split(/\r?\n/).map((url) => url.trim()).filter(Boolean),
    }, authorization);
    for (const image of images) {
      const doc = await getDocument(image.documentId, image.revision, authorization);
      await attachDocument(
        targetType === 'country' ? 'country_wiki' : 'constitution_wiki',
        targetId,
        image.documentId,
        doc.revision.id,
        authorization,
        draft.id,
      );
    }
  } catch {
    redirect(editHref(targetType, targetId, code, 'error'));
  }
  revalidatePath(`/countries/${code}`);
  redirect(editHref(targetType, targetId, code, 'saved'));
}

export async function publishWikiAction(form: FormData) {
  const { targetType, targetId, code } = target(form);
  const authorization = await requireSessionBearer();
  try {
    await publishWikiPage(targetType, targetId, String(form.get('revisionId') ?? ''), authorization);
  } catch {
    redirect(editHref(targetType, targetId, code, 'error'));
  }
  revalidatePath(`/countries/${code}`);
  if (targetType === 'constitution') revalidatePath(`/countries/${code}/constitutions/${targetId}`);
  redirect(editHref(targetType, targetId, code, 'published'));
}
