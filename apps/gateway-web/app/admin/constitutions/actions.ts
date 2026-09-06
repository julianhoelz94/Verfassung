'use server';

import { redirect } from 'next/navigation';
import { createConstitution, ensureCountry, putContentOutline, restructureVersion, type OutlineKindWrite } from '../../../lib/api';
import { requireAdminUser } from '../../../lib/admin';
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
    });
  });
}

export async function saveOutlineAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const constitutionId = String(formData.get('constitutionId') ?? '');
  let kinds: OutlineKindWrite[];
  try {
    kinds = parseOutline(String(formData.get('outline') ?? '[]'));
  } catch {
    redirect(`/admin/constitutions/${encodeURIComponent(constitutionId)}?error=1`);
  }
  try {
    const result = await putContentOutline(constitutionId, kinds);
    const keepKinds = kinds.map((kind) => kind.kindCode);
    for (const versionId of result.versionIds) {
      await restructureVersion(versionId, keepKinds);
    }
  } catch {
    redirect(`/admin/constitutions/${encodeURIComponent(constitutionId)}?error=1`);
  }
  redirect(`/admin/constitutions/${encodeURIComponent(constitutionId)}?saved=1`);
}

export async function createConstitutionAction(formData: FormData): Promise<void> {
  await requireAdmin();
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
      await ensureCountry(newCountry.isoCode, newCountry.name);
    }
    const created = await createConstitution(isoCode, slug, title, outline);
    createdId = created.id;
  } catch {
    redirect('/admin/constitutions?error=1');
  }
  redirect(`/admin/constitutions/${encodeURIComponent(createdId)}`);
}
