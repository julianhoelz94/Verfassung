import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ user: vi.fn(), collection: vi.fn(), events: vi.fn(), provisions: vi.fn(), content: vi.fn(), locale: vi.fn() }));
vi.mock('../../../lib/session', () => ({ currentUser: mocks.user }));
vi.mock('../../../lib/country-directory', () => ({ loadConstitutionCollection: mocks.collection }));
vi.mock('../../../lib/api', () => ({ getConstitutionEvents: mocks.events, getConstitutionProvisionEvents: mocks.provisions, getExportedUnits: mocks.content }));
vi.mock('../../../lib/server-locale', () => ({ currentLocale: mocks.locale }));
vi.mock('./LifecycleWorkspace', () => ({ LifecycleWorkspace: () => null }));
vi.mock('../documents/DocumentLinks', () => ({ DocumentLinks: () => null }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('not-found'); }, redirect: (url: string) => { throw new Error('redirect:' + url); } }));
import Page from './[constitutionId]/page';

const constitutionId = 'constitution';
const versions = [{ id: 'legal', currentVersionId: 'current', versionLabel: '2022', listing: 'public' }, { id: 'private', listing: 'staff' }];
const collection = { collection: { name: 'Germany', constitutions: [{ id: constitutionId, title: 'Constitution', versions }] }, owner: { name: 'Germany', href: '/countries/DE' } };
const oldEvent = { id: 'old-event', constitutionId, sourceVersionId: 'archive', logicalUnitIds: ['unit'], eventType: 'deferred', eventDate: '1949-05-08' };
const roots = (title: string) => ({ roots: [{ logicalId: 'unit', kind: 'Article', label: '1', title, content: [] }] });
beforeEach(() => {
  vi.resetAllMocks(); mocks.user.mockResolvedValue({ roles: ['publisher'] }); mocks.collection.mockResolvedValue(collection);
  mocks.events.mockResolvedValue([{ id: 'whole' }]); mocks.provisions.mockResolvedValue([oldEvent, { ...oldEvent, id: 'second-old' }]); mocks.locale.mockResolvedValue('en');
  mocks.content.mockImplementation(async (id: string) => roots(id === 'current' ? 'Current wording' : 'Historical wording'));
});
async function page(query: Record<string, string> = {}) {
  const result = await Page({ params: Promise.resolve({ constitutionId }), searchParams: Promise.resolve({ code: 'de', ...query }) });
  return (result.props.children as ReactElement<Record<string, any>>).props;
}

describe('lifecycle page boundaries', () => {
  it('resolves historical provision labels from their pinned snapshot and shares duplicate reads', async () => {
    const props = await page({ versionId: 'legal', eventId: 'whole', saved: '1' });
    expect(props.sourceVersionId).toBe('current'); expect(props.units[0].path).toContain('Current wording');
    expect(props.provisionContexts['old-event']).toEqual({ versionHref: '/countries/DE/versions/archive', versionLabel: undefined, units: [{ id: 'unit', path: 'Article · 1 · Historical wording' }] });
    expect(mocks.content.mock.calls.map(call => call[0])).toEqual(['current', 'archive']);
    expect(props.versions).toEqual([{ id: 'current', label: '2022' }]); expect(props.canCreate).toBe(false);
    expect(props.materials['old-event'].props).toMatchObject({ targetType: 'lifecycle_material', targetId: constitutionId, scopeRevisionId: 'old-event' });
    expect(props.saved).toBe(true); expect(props.initialEventId).toBe('whole');
  });
  it('uses regional ownership, preserves valid return links, and grants library creation only to the right roles', async () => {
    mocks.user.mockResolvedValue({ roles: ['admin'] }); mocks.locale.mockResolvedValue('de');
    mocks.collection.mockResolvedValue({ ...collection, owner: { name: 'Region', href: '/jurisdictions/region' } });
    const props = await page({ jurisdictionId: 'region', returnTo: '/event?view=source', error: '1' });
    expect(mocks.collection).toHaveBeenCalledWith({ id: 'region' }); expect(props.canCreate).toBe(true); expect(props.ownerName).toBe('Region');
    expect(props.provisionContexts['old-event'].versionHref).toBe('/jurisdictions/region/versions/archive');
    expect(props.returnTo).toBe('/event?view=source'); expect(props.backHref).toBe('/event?view=source'); expect(props.failed).toBe(true);
    expect(props.materials.whole.props.heading).toBe('Quellen dieses Ereignisses');
  });
  it('keeps missing content explicit without inventing passage labels or losing the pinned link', async () => {
    mocks.content.mockRejectedValue(new Error('unavailable'));
    const props = await page({ returnTo: '//external.example' });
    expect(props.units).toEqual([]); expect(props.provisionContexts['old-event'].units).toEqual([]);
    expect(props.provisionContexts['old-event'].versionHref).toContain('/versions/archive');
    expect(props.backHref).toBe('/editor'); expect(props.returnTo).toContain('/editor/lifecycle/constitution?');
    mocks.collection.mockResolvedValue({ ...collection, collection: { constitutions: [{ id: constitutionId, title: 'Empty', versions: [] }] } });
    mocks.provisions.mockResolvedValue(null); mocks.events.mockResolvedValue(null); mocks.content.mockClear();
    const empty = await page(); expect(empty.sourceVersionId).toBeUndefined(); expect(empty.units).toEqual([]); expect(empty.materials).toEqual({}); expect(mocks.content).not.toHaveBeenCalled();
  });
  it('checks identity, role and constitution ownership before loading event material', async () => {
    mocks.user.mockResolvedValue(null); await expect(page()).rejects.toThrow('redirect:/login?');
    mocks.user.mockResolvedValue({ roles: ['editor'] }); await expect(page()).rejects.toThrow('not-found'); expect(mocks.collection).not.toHaveBeenCalled();
    mocks.user.mockResolvedValue({ roles: ['publisher'] }); mocks.collection.mockResolvedValue(null); await expect(page()).rejects.toThrow('not-found'); expect(mocks.events).not.toHaveBeenCalled();
  });
});
