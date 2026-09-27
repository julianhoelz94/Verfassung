'use server';

import { redirect } from 'next/navigation';
import { createConstitution, ensureCountry, preflightSettings, saveSettings, restoreSettings, type OutlineKindWrite } from '../../../lib/api';
import { requireAdminUser } from '../../../lib/admin';
import { requireSessionBearer } from '../../../lib/session';
import { constitutionIsoCode, countryToCreate } from '../../../lib/create-constitution';
import { toOutlineKindWrite } from '../../../lib/outline';

async function requireAdmin(): Promise<void> {
  await requireAdminUser('/admin/constitutions?error=forbidden');
}

function parseOutline(raw: string): OutlineKindWrite[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('outline');
  }
  return parsed.map((item) => {
    const kind = item as Record<string, unknown>;
    return toOutlineKindWrite({
      kindCode: String(kind.kindCode ?? ''),
      displayLabel: String(kind.displayLabel ?? ''),
      presentation: String(kind.presentation ?? 'section'),
      showLabel: Boolean(kind.showLabel),
      showTitle: Boolean(kind.showTitle),
      showKind: Boolean(kind.showKind),
      allowTextAlongsideChildren: Boolean(kind.allowTextAlongsideChildren),
      titlePolicy: kind.titlePolicy as OutlineKindWrite['titlePolicy'],
      labelPolicy: kind.labelPolicy as OutlineKindWrite['labelPolicy'],
      labelPlacement: kind.labelPlacement as OutlineKindWrite['labelPlacement'],
      segmentation: kind.segmentation as OutlineKindWrite['segmentation'],
    });
  });
}

export async function saveOutlineAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const authorization = await requireSessionBearer();
  const constitutionId = String(formData.get('constitutionId') ?? '');
  let kinds: OutlineKindWrite[];
  try {
    kinds = parseOutline(String(formData.get('outline') ?? '[]'));
  } catch {
    redirect(`/admin/constitutions/${encodeURIComponent(constitutionId)}?error=1`);
  }
  let impact;
  try {
    impact = await preflightSettings(constitutionId, kinds, authorization);
  } catch {
    redirect(`/admin/constitutions/${encodeURIComponent(constitutionId)}?error=1`);
  }
  if (impact.classification === 'migration_required') {
    redirect(`/admin/constitutions/${encodeURIComponent(constitutionId)}?migration=1`);
  }
  try {
    await saveSettings(constitutionId, String(formData.get('settingsRevisionId') ?? ''), kinds, authorization);
  } catch {
    redirect(`/admin/constitutions/${encodeURIComponent(constitutionId)}?error=1`);
  }
  redirect(`/admin/constitutions/${encodeURIComponent(constitutionId)}?saved=1`);
}

export async function createConstitutionAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const authorization = await requireSessionBearer();
  const slug = String(formData.get('slug') ?? '');
  const title = String(formData.get('title') ?? '');
  let isoCode: string;
  let newCountry: { isoCode: string; name: string } | null;
  let outline: OutlineKindWrite[];
  try {
    isoCode = constitutionIsoCode(String(formData.get('isoCode') ?? ''));
    newCountry = countryToCreate(isoCode, String(formData.get('countryName') ?? ''));
    outline = parseOutline(String(formData.get('outline') ?? '[]'));
  } catch {
    redirect('/admin/constitutions?error=1');
  }
  let createdId: string;
  try {
    if (newCountry) {
      await ensureCountry(newCountry.isoCode, newCountry.name, authorization);
    }
    const created = await createConstitution(isoCode, slug, title, outline, authorization);
    createdId = created.id;
  } catch {
    redirect('/admin/constitutions?error=1');
  }
  redirect(`/admin/constitutions/${encodeURIComponent(createdId)}`);
}

export async function previewOutlineImpactAction(formData: FormData) {
  await requireAdmin();
  const authorization = await requireSessionBearer();
  return preflightSettings(String(formData.get('constitutionId')), parseOutline(String(formData.get('outline'))), authorization);
}

export async function restoreOutlineAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const authorization = await requireSessionBearer();
  const id = String(formData.get('constitutionId'));
  try {
    await restoreSettings(id, String(formData.get('revisionId')), String(formData.get('settingsRevisionId')), authorization);
  } catch { redirect(`/admin/constitutions/${encodeURIComponent(id)}?error=1`); }
  redirect(`/admin/constitutions/${encodeURIComponent(id)}?saved=1`);
}
