'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { appendConstitutionLifecycle, appendProvisionLifecycle, type ConstitutionLifecycleEvent, type ProvisionLifecycleEvent } from '../../../lib/api';
import { currentUser, requireSessionBearer } from '../../../lib/session';

export async function appendLifecycleAction(form: FormData) {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!user.roles.some((role) => role === 'publisher' || role === 'admin')) {
    redirect('/editor');
  }
  const constitutionId = String(form.get('constitutionId') ?? '');
  const code = String(form.get('code') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(constitutionId) || !/^[a-z]{2}$/i.test(code)) throw new Error('Invalid constitution');
  try {
    await appendConstitutionLifecycle(constitutionId, {
      eventType: String(form.get('eventType') ?? '') as ConstitutionLifecycleEvent['eventType'],
      eventDate: String(form.get('eventDate') ?? ''),
      dateCertainty: form.get('dateCertainty') === 'approximate' ? 'approximate' : 'exact',
      sourceUrl: String(form.get('sourceUrl') ?? '').trim() || undefined,
      note: String(form.get('note') ?? '').trim() || undefined,
    }, await requireSessionBearer());
  } catch {
    redirect(`/editor/lifecycle/${constitutionId}?code=${code}&error=1`);
  }
  revalidatePath(`/countries/${code}`);
  revalidatePath(`/countries/${code}/constitution-timeline`);
  redirect(`/editor/lifecycle/${constitutionId}?code=${code}&saved=1`);
}

export async function appendProvisionAction(form: FormData) {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!user.roles.some((role) => role === 'publisher' || role === 'admin')) redirect('/editor');
  const constitutionId = String(form.get('constitutionId') ?? '');
  const code = String(form.get('code') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(constitutionId) || !/^[a-z]{2}$/i.test(code)) throw new Error('Invalid constitution');
  const sourceVersionId = String(form.get('sourceVersionId') ?? '');
  try {
    await appendProvisionLifecycle(constitutionId, {
      sourceVersionId,
      eventType: String(form.get('eventType') ?? '') as ProvisionLifecycleEvent['eventType'],
      eventDate: String(form.get('eventDate') ?? ''),
      logicalUnitIds: form.getAll('logicalUnitIds').map(String),
      sourceUrl: String(form.get('sourceUrl') ?? '').trim() || undefined,
      note: String(form.get('note') ?? '').trim() || undefined,
    }, await requireSessionBearer());
  } catch {
    redirect(`/editor/lifecycle/${constitutionId}?code=${code}&versionId=${sourceVersionId}&error=1`);
  }
  revalidatePath(`/countries/${code}/constitution-timeline`);
  redirect(`/editor/lifecycle/${constitutionId}?code=${code}&versionId=${sourceVersionId}&saved=1`);
}
