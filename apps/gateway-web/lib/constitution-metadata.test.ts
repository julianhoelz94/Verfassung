// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { ConstitutionMetadataError, getConstitutionMetadata, saveConstitutionMetadata } from './constitution-metadata';

afterEach(() => { vi.unstubAllGlobals(); });
const metadata = { revisionId: 'new-revision', predecessorId: 'old-revision', title: 'Constitution', slug: 'constitution' };
const payload = { expectedRevisionId: 'old-revision', title: 'Constitution', slug: 'constitution', retainSlugAlias: true as const };

it('reads current metadata with the authenticated bearer and no cache', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(metadata))); vi.stubGlobal('fetch', fetch);
  expect(await getConstitutionMetadata('constitution-id', 'Bearer editor')).toEqual(metadata);
  expect(fetch.mock.calls[0][0]).toContain('/constitutions/constitution-id/metadata');
  expect(fetch.mock.calls[0][1]).toMatchObject({ cache: 'no-store', headers: { Authorization: 'Bearer editor' } });
});
it('preserves optimistic revision and the permanent alias instruction when saving', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(metadata))); vi.stubGlobal('fetch', fetch);
  expect(await saveConstitutionMetadata('constitution-id', payload, 'Bearer editor')).toEqual(metadata);
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(payload);
  expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'PUT', headers: { Authorization: 'Bearer editor', 'Content-Type': 'application/json' } });
});
it.each(['stale_metadata', 'slug_reserved', 'slug_alias_required'])('keeps the %s conflict machine-readable', async key => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: key }), { status: 409 })));
  await expect(saveConstitutionMetadata('constitution-id', payload, 'Bearer editor')).rejects.toEqual(new ConstitutionMetadataError(409, key));
});
it('does not expose an upstream error body to the browser', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('internal failure', { status: 500 })));
  await expect(saveConstitutionMetadata('constitution-id', payload, 'Bearer editor')).rejects.toEqual(new ConstitutionMetadataError(500, 'save_failed'));
});
