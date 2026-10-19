// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { publishImprintDetails, publishLegalPage } from './legal-pages';

afterEach(() => vi.unstubAllGlobals());

describe('legal publication errors', () => {
  it.each([
    ['Publish the shared imprint details first', 'contact_required'],
    ['Replace example contact details before publication', 'example_contact'],
    ['Replace example legal details before publication', 'example_text'],
    ['Remove contact and address details from the legal prose before publication', 'duplicate_contact'],
    ['Invalid contact email', 'invalid_contact'],
  ])('reports the actionable reason for %s', async (error, reason) => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error }, { status: 400 })));
    await expect(publishLegalPage('impressum', 1, 'Bearer admin')).rejects.toMatchObject({ reason });
    await expect(publishImprintDetails(1, 'Bearer admin')).rejects.toMatchObject({ reason });
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
