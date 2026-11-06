'use server';

import { safeReturnTo } from '../../../lib/return-to';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { reviseLifecycleEvidence, appendConstitutionLifecycle, appendProvisionLifecycle, type ConstitutionLifecycleEvent, type ProvisionLifecycleEvent } from '../../../lib/api';
import { currentUser, requireSessionBearer } from '../../../lib/session';

export async function appendLifecycleAction(form: FormData) {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!user.roles.some((role) => role === 'publisher' || role === 'admin')) {
    redirect('/editor');
  }
  const constitutionId = String(form.get('constitutionId') ?? '');
  const code = String(form.get('code') ?? '');
  const jurisdictionId=String(form.get('jurisdictionId')??'');
  const owner=jurisdictionId?`/jurisdictions/${jurisdictionId}`:`/countries/${code}`;
  const ownerQuery=jurisdictionId?`jurisdictionId=${encodeURIComponent(jurisdictionId)}`:`code=${encodeURIComponent(code)}`;
  if (!/^[0-9a-f-]{36}$/i.test(constitutionId) || (!/^[a-z]{2}$/i.test(code)&&!/^[0-9a-f-]{36}$/i.test(jurisdictionId))) throw new Error('Invalid constitution');
  try {
    await appendConstitutionLifecycle(constitutionId, {
      eventType: String(form.get('eventType') ?? '') as ConstitutionLifecycleEvent['eventType'],
      eventDate: String(form.get('eventDate') ?? ''),
      dateCertainty: form.get('dateCertainty') === 'approximate' ? 'approximate' : 'exact',
      sourceUrl: String(form.get('sourceUrl') ?? '').trim() || undefined,
      note: String(form.get('note') ?? '').trim() || undefined,
    }, await requireSessionBearer());
  } catch {
    redirect(`/editor/lifecycle/${constitutionId}?${ownerQuery}&error=1`);
  }
  revalidatePath(owner);
  revalidatePath(`${owner}/constitutions/${constitutionId}`);
  redirect(`/editor/lifecycle/${constitutionId}?${ownerQuery}&saved=1`);
}

export async function appendProvisionAction(form: FormData) {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!user.roles.some((role) => role === 'publisher' || role === 'admin')) redirect('/editor');
  const constitutionId = String(form.get('constitutionId') ?? '');
  const code = String(form.get('code') ?? '');
  const jurisdictionId=String(form.get('jurisdictionId')??'');
  const owner=jurisdictionId?`/jurisdictions/${jurisdictionId}`:`/countries/${code}`;
  const ownerQuery=jurisdictionId?`jurisdictionId=${encodeURIComponent(jurisdictionId)}`:`code=${encodeURIComponent(code)}`;
  if (!/^[0-9a-f-]{36}$/i.test(constitutionId) || (!/^[a-z]{2}$/i.test(code)&&!/^[0-9a-f-]{36}$/i.test(jurisdictionId))) throw new Error('Invalid constitution');
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
    redirect(`/editor/lifecycle/${constitutionId}?${ownerQuery}&versionId=${sourceVersionId}&error=1`);
  }
  revalidatePath(`${owner}/constitutions/${constitutionId}`);
  redirect(`/editor/lifecycle/${constitutionId}?${ownerQuery}&versionId=${sourceVersionId}&saved=1`);
}

export async function reviseLifecycleEvidenceAction(form:FormData) {
  const user=await currentUser();
  if(!user?.roles.some(role=>role==='publisher'||role==='admin'))redirect('/editor');
  const constitutionId=String(form.get('constitutionId')??''),eventId=String(form.get('eventId')??'');
  const destination=new URL(safeReturnTo(String(form.get('returnTo')??''),'/editor'),'https://atlas.invalid');
  try {
    await reviseLifecycleEvidence(constitutionId,eventId,{note:String(form.get('note')??''),sourceUrl:String(form.get('sourceUrl')??''),expectedRevisionId:String(form.get('expectedRevisionId')??'')||null},await requireSessionBearer());
    revalidatePath(destination.pathname);destination.searchParams.set('saved','1');
  } catch { destination.searchParams.set('error','1'); }
  redirect(destination.pathname+destination.search+destination.hash);
}
