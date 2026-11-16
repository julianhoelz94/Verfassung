import { describe, expect, it } from 'vitest';
import { emptyInboxFilters, filterInboxRows, inboxFilters, inboxHref, inboxQueues, safeInboxHref, selectedInboxQueue, workManagement, type InboxRow } from './editor-inbox';
const draft: InboxRow = { id: 'a', kind: 'correction', status: 'open', owned: true, countryKey: 'DE', country: 'Germany', constitutionKey: 'c', constitution: 'Basic Law', jurisdiction: 'Bavaria', version: '1949', workspaceHref: '/editor?sessionId=a', updatedAt: null };
describe('editor inbox state and capability boundaries', () => {
  it('uses the authorised queue union and role-appropriate defaults', () => {
    expect(inboxQueues(['editor'])).toEqual(['mine']);
    expect(inboxQueues(['admin'])).toEqual(['mine', 'reviewing', 'approved']);
    expect(inboxQueues(['reviewer', 'publisher'])).toEqual(['reviewing', 'approved']);
    expect(selectedInboxQueue(['reviewer'], 'approved')).toBe('reviewing');
    expect(selectedInboxQueue(['publisher'])).toBe('approved');
  });
  it('round-trips search and filters without accepting a workspace or an external return target', () => {
    const filters = inboxFilters({ query: 'Charter & law', country: 'DE', kind: 'legal', workStatus: 'published', archived: 'true' });
    const href = inboxHref('mine', filters);
    expect(safeInboxHref(href)).toBe(href);
    for (const value of ['https://example.com/editor', '//example.com/editor', '/editor?sessionId=secret', '/editor?mine=1&command=publish', '/editor?status=unknown', '/editor?mine=1#secret']) expect(safeInboxHref(value)).toBeNull();
    expect(inboxHref('reviewing', filters)).not.toContain('archived');
  });
  it('searches full jurisdiction context, combines filters, and normalizes import workflow states', () => {
    const rows = [draft, { ...draft, id: 'b', kind: 'import' as const, status: 'completed' }];
    expect(filterInboxRows(rows, { ...emptyInboxFilters, query: 'Bavaria', workStatus: 'published' }, 'en').map(row => row.id)).toEqual(['b']);
    expect(filterInboxRows(rows, { ...emptyInboxFilters, kind: 'legal' }, 'en')).toEqual([]);
    expect(filterInboxRows([{ ...draft, kind: 'legal' }], { ...emptyInboxFilters, query: 'Rechtsänderung' }, 'de')).toHaveLength(1);
  });
  it('limits management to supported owned transitions', () => {
    expect(workManagement(draft, false)).toBe('discard');
    expect(workManagement({ ...draft, owned: false }, false)).toBeNull();
    expect(workManagement({ ...draft, status: 'reviewing' }, false)).toBeNull();
    expect(workManagement({ ...draft, status: 'published' }, false)).toBe('archive');
    expect(workManagement({ ...draft, kind: 'import', status: 'failed' }, true)).toBe('restore');
    expect(workManagement({ ...draft, kind: 'import', status: 'approved' }, false)).toBeNull();
  });
});
