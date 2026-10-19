// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { publishLegalPage, saveLegalPageDraft } from './legal-pages';

afterEach(() => vi.unstubAllGlobals());

describe('legal publication errors', () => {
  it('sends both optimistic revisions for one combined imprint write', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({}));
    vi.stubGlobal('fetch', fetchMock);
    const contact = { expectedRevision: 3, name: 'Atlas', streetAddress: 'Lane 1', postalCode: '12345', city: 'City', country: 'Country', email: 'atlas@example.test' };
    await saveLegalPageDraft('impressum_en', 'Reviewed text', 2, 'Bearer admin', contact);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ content: 'Reviewed text', expectedRevision: 2, contact });
    await publishLegalPage('impressum_en', 3, 'Bearer admin', 4);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ expectedRevision: 3, expectedContactRevision: 4 });
  });
  it.each([
    ['Publish the shared imprint details first', 'contact_required'],
    ['Replace example contact details before publication', 'example_contact'],
    ['Replace example legal details before publication', 'example_text'],
    ['Remove contact and address details from the legal prose before publication', 'duplicate_contact'],
    ['Invalid contact email', 'invalid_contact'],
  ])('reports the actionable reason for %s', async (error, reason) => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error }, { status: 400 })));
    await expect(publishLegalPage('impressum', 1, 'Bearer admin')).rejects.toMatchObject({ reason });

  });

  it('asks for a fresh revision on an optimistic-lock conflict', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'Legal page draft changed' }, { status: 409 })));
    await expect(publishLegalPage('impressum_en', 1, 'Bearer admin')).rejects.toMatchObject({ reason: 'conflict' });
  });

  it('does not expose arbitrary backend error text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('internal details', { status: 500 })));
    await expect(publishLegalPage('impressum', 1, 'Bearer admin')).rejects.toMatchObject({ reason: 'unavailable' });
  });
});
