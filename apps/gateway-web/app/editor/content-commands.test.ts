// DOC-1/OUTLINE-1/WIKI-1/EDIT-1: Editorial Guide and settings/document contracts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { revalidatePath } from 'next/cache';
import { currentUser, requireSessionBearer } from '../../lib/session';
import { form, json } from '../../test/server-boundary';
import * as documents from './documents/actions';
import * as outline from '../admin/constitutions/actions';
import * as wiki from './wiki/actions';
import * as lifecycle from './lifecycle/actions';
import * as imports from '../admin/import/actions';

vi.mock('../../lib/session', () => ({ currentUser: vi.fn(), requireSessionBearer: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const requests: { path: string; method: string; body: unknown; authorization: string | null }[] = [];
let status = 200;
let impact = 'reversible';
let responseBody: unknown;
let wikiCanonicalType: string | undefined;
const documentRecord = { id: 'document', currentRevision: 3, revision: { id: 'document-r3', revision: 3, title: 'Official source' } };
const kinds = [{ kindCode: 'article', displayLabel: 'Article', presentation: 'section', showLabel: true, showTitle: true, showKind: true, titlePolicy: 'optional', labelPolicy: 'required', root: true, allowedChildKinds: [] }];
const structureForm = () => form({ constitutionId: id, settingsRevisionId: 'settings-r2', outline: JSON.stringify(kinds) });
const wikiForm = (extra: Record<string, string> = {}) => form({ targetType: 'constitution', targetId: id, code: 'XA', expectedRevisionId: 'wiki-r1', summary: 'Summary', body: 'Authored body', images: '[]', sourceUrls: ' https://archive.example/a \n\nhttps://archive.example/b', ...extra });
const payload = { isoCode: 'XA', countryName: 'Test Republic', constitutionSlug: 'charter', constitutionTitle: 'Charter', versionLabel: '1949', articles: [{ articleNumber: '1', body: 'Authored text' }] };
beforeEach(() => {
  requests.length = 0; status = 200; impact = 'reversible'; responseBody = undefined;
  wikiCanonicalType = undefined;
  vi.mocked(currentUser).mockResolvedValue({ id: 'author', email: 'author@example.test', roles: ['admin'], stepUpFresh: true });
  vi.mocked(requireSessionBearer).mockResolvedValue('Bearer writer-session');
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const body = init?.body instanceof FormData ? init.body : init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ path: url.pathname + url.search, method: init?.method ?? 'GET', body, authorization: new Headers(init?.headers).get('Authorization') });
    if (responseBody !== undefined) return json(responseBody, status);
    if (url.pathname.endsWith('/preflight')) return json({ classification: impact, currentRevisionId: 'settings-r2' }, status);
    if (url.pathname.includes('/api/document/documents')) {
      const requestedId = url.pathname.split('/').at(-1)!;
      const revision = Number(url.searchParams.get('revision') ?? documentRecord.currentRevision);
      return json((init?.method ?? 'GET') === 'GET' ? { ...documentRecord, id: requestedId, revision: { ...documentRecord.revision, id: `${requestedId}-r${revision}`, revision } } : documentRecord, status);
    }
    return json({ id: 'saved-draft', ...documentRecord, ...(url.pathname.includes('/wiki/') ? { id: 'wiki-r2', targetType: wikiCanonicalType ?? url.pathname.split('/wiki/')[1].split('/')[0] } : {}) }, status);
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

describe('document writes preserve revision and target identity', () => {
  it.each(['viewer', 'reviewer'])('rejects a %s before creating a document', async role => {
    vi.mocked(currentUser).mockResolvedValue({ id: 'reader', email: 'reader@example.test', roles: [role] });
    await expect(documents.createDocumentAction(form({ title: 'Source' }))).rejects.toThrow('redirect:/editor/documents?error=forbidden'); expect(requests).toEqual([]);
  });
  it('creates a managed document without placing external return URLs in its destination', async () => {
    const destination = await documents.createDocumentAction(form({ title: 'Official source', description: 'Archive', sourceUrl: 'https://archive.example/source', returnTo: '//attacker.example' }));
    expect(destination).toBe('/editor/documents/document?created=1&returnTo=%2Feditor%2Fdocuments');
    expect(requests[0]).toMatchObject({ path: '/api/document/documents', method: 'POST', body: { title: 'Official source', description: 'Archive', sourceUrl: 'https://archive.example/source' }, authorization: 'Bearer writer-session' });
  });
  it('retains expectedRevision and shows a conflict instead of overwriting a revision', async () => {
    const data = form({ id: 'document', title: 'Corrected source', expectedRevision: '2' });
    status = 409; expect(await documents.reviseDocumentAction(data)).toBe('/editor/documents/document?error=conflict');
    expect(requests[0].body).toMatchObject({ expectedRevision: 2, title: 'Corrected source' }); expect(revalidatePath).not.toHaveBeenCalled();
    status = 200; expect(await documents.reviseDocumentAction(data)).toBe('/editor/documents/document?saved=1');
  });
  it('requires a file and retains the expected revision when uploading it', async () => {
    const data = form({ id: 'document', expectedRevision: '2' });
    expect(await documents.uploadDocumentAction(data)).toContain('error=file'); expect(requests).toEqual([]);
    data.set('file', new File(['source bytes'], 'source.txt', { type: 'text/plain' }));
    expect(await documents.uploadDocumentAction(data)).toBe('/editor/documents/document?saved=1');
    expect(requests[0]).toMatchObject({ path: '/api/document/documents/document/file?expectedRevision=2', method: 'POST' }); expect((requests[0].body as FormData).get('file')).toBeInstanceOf(File);
    status = 413; expect(await documents.uploadDocumentAction(data)).toContain('error=file');
  });
  it('pins an attachment to the chosen document and editorial revision', async () => {
    const data = form({ targetType: 'amendment', targetId: 'instrument', documentId: 'document', revisionId: 'document-r2', scopeRevisionId: 'instrument-r7', returnTo: '/editor/amendments/instrument?tab=documents' });
    expect(await documents.attachDocumentAction(data)).toBe('/editor/amendments/instrument?tab=documents');
    expect(requests[0]).toMatchObject({ path: '/api/document/links/amendment/instrument', method: 'POST', body: { documentId: 'document', revisionId: 'document-r2', scopeRevisionId: 'instrument-r7' } });
    expect(revalidatePath).toHaveBeenCalledWith('/editor/amendments/instrument');
    status = 409; expect(await documents.attachDocumentAction(data)).toBe('/editor/amendments/instrument?tab=documents&documentError=attach');
  });
  it.each(['/\n/attacker.example', '/%2f%2fattacker.example', '/parent/..//attacker.example'])('rejects an ambiguous return destination %j after attachment', async returnTo => {
    expect(await documents.attachDocumentAction(form({ targetType: 'version', targetId: 'snapshot', documentId: 'document', returnTo }))).toBe('/editor/documents');
  });
  it('detaches only the scoped document link', async () => {
    const data = form({ targetType: 'version', targetId: 'snapshot', documentId: 'document', scopeRevisionId: 'scope-r1', returnTo: '/editor/documents' });
    expect(await documents.detachDocumentAction(data)).toBe('/editor/documents'); expect(requests[0]).toMatchObject({ path: '/api/document/links/version/snapshot/document?scopeRevisionId=scope-r1', method: 'DELETE' });
    status = 403; expect(await documents.detachDocumentAction(data)).toBe('/editor/documents?documentError=detach');
  });
  it('does not claim creation after upstream rejection', async () => {
    status = 400; expect(await documents.createDocumentAction(form({ title: '' }))).toContain('error=save'); expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('structure changes use preflight and revision guards', () => {
  it('preflights before saving and preserves literal labels and authoring policies', async () => {
    expect(await outline.saveOutlineAction(structureForm())).toBe(`/admin/constitutions/${id}?saved=1`);
    expect(requests.map(r => [r.method, r.path])).toEqual([['POST', `/api/catalog/constitutions/${id}/settings/preflight`], ['PUT', `/api/catalog/constitutions/${id}/settings`]]);
    expect(requests[1].body).toMatchObject({ expectedRevisionId: 'settings-r2', kinds: [expect.objectContaining({ displayLabel: 'Article', titlePolicy: 'optional', labelPolicy: 'required', root: true, allowedChildKinds: [] })] });
    expect(requests.every(r => !r.path.includes('restructure'))).toBe(true);
  });
  it('requires migration instead of saving a change that affects published structures', async () => {
    impact = 'migration_required'; expect(await outline.saveOutlineAction(structureForm())).toBe(`/admin/constitutions/${id}?migration=1`); expect(requests).toHaveLength(1); expect(revalidatePath).not.toHaveBeenCalled();
  });
  it.each(['[]', '{}', '{'])('rejects an invalid structure %s without contacting services', async raw => {
    const data = structureForm(); data.set('outline', raw); expect(await outline.saveOutlineAction(data)).toContain('error=1'); expect(requests).toEqual([]);
  });
  it('does not save after preflight fails', async () => {
    status = 503; expect(await outline.saveOutlineAction(structureForm())).toContain('error=1'); expect(requests).toHaveLength(1);
  });
  it('restores a settings revision with the current revision as a concurrency guard', async () => {
    await expect(outline.restoreOutlineAction(form({ constitutionId: id, revisionId: 'settings-r1', settingsRevisionId: 'settings-r2' }))).rejects.toThrow(`redirect:/admin/constitutions/${id}?saved=1`);
    expect(requests[0]).toMatchObject({ path: `/api/catalog/constitutions/${id}/settings/settings-r1/restore`, body: { expectedRevisionId: 'settings-r2' } });
    status = 409; await expect(outline.restoreOutlineAction(form({ constitutionId: id, revisionId: 'settings-r1' }))).rejects.toThrow('?error=1');
  });
  it('keeps impact preview read-only', async () => {
    expect(await outline.previewOutlineImpactAction(structureForm())).toMatchObject({ classification: 'reversible' }); expect(requests).toHaveLength(1); expect(requests[0].path).toContain('/preflight');
  });
  it('requires administrator access before changing or previewing settings', async () => {
    vi.mocked(currentUser).mockResolvedValue(null); expect(await outline.saveOutlineAction(structureForm())).toBe('/login'); expect(requests).toEqual([]);
    vi.mocked(currentUser).mockResolvedValue({ id: 'author', email: 'author@example.test', roles: ['editor'] }); expect(await outline.createConstitutionAction(form({}))).toContain('forbidden'); expect(await outline.previewOutlineImpactAction(structureForm())).toEqual({ redirectTo: '/admin/constitutions?error=forbidden' });
  });
  it('creates a constitution with its configured outline without publishing content', async () => {
    responseBody = { id: 'new-charter' }; const data = structureForm(); data.set('isoCode', 'xa'); data.set('slug', 'charter'); data.set('title', 'New Charter'); data.set('interim', 'on');
    expect(await outline.createConstitutionAction(data)).toBe('/admin/constitutions/new-charter'); expect(requests[0]).toMatchObject({ path: '/api/catalog/countries/XA/constitutions', body: { title: 'New Charter', interim: true } }); expect(requests).toHaveLength(1);
  });
});

describe('contextual pages separate draft and publication', () => {
  it('saves and publishes a jurisdiction wiki without inventing a country code', async () => {
    const data = wikiForm({ targetType: 'jurisdiction', code: '' });
    expect(await wiki.saveWikiAction(data)).toBe(`/editor/wiki/jurisdiction/${id}?saved=1`);
    expect(requests[0]).toMatchObject({ method: 'PUT', path: `/api/catalog/wiki/jurisdiction/${id}/draft`, authorization: 'Bearer writer-session' });
    expect(revalidatePath).toHaveBeenCalledWith(`/jurisdictions/${id}`);
    requests.length = 0;
    data.set('revisionId', 'wiki-r2');
    expect(await wiki.publishWikiAction(data)).toBe(`/editor/wiki/jurisdiction/${id}?published=1`);
    expect(requests[0]).toMatchObject({ method: 'POST', path: `/api/catalog/wiki/jurisdiction/${id}/publish`, body: { revisionId: 'wiki-r2' } });
  });
  it('pins images to the canonical wiki identity returned for a legacy country alias', async () => {
    wikiCanonicalType = 'country';
    const data = wikiForm({ targetType: 'jurisdiction', code: '', images: JSON.stringify([{ documentId: 'seal', revision: 2, alt: 'Seal' }]) });
    expect(await wiki.saveWikiAction(data)).toContain('saved=1');
    expect(requests[2]).toMatchObject({ path: `/api/document/links/country_wiki/${id}`, body: { documentId: 'seal', revisionId: 'seal-r2', scopeRevisionId: 'wiki-r2' } });
  });
  it('saves authored content with its revision guard and normalized source URLs', async () => {
    expect(await wiki.saveWikiAction(wikiForm())).toContain('saved=1'); expect(requests[0]).toMatchObject({ method: 'PUT', path: `/api/catalog/wiki/constitution/${id}/draft`, body: { expectedRevisionId: 'wiki-r1', summary: 'Summary', body: 'Authored body', images: [], sourceUrls: ['https://archive.example/a', 'https://archive.example/b'] } }); expect(requests).toHaveLength(1);
  });
  it('publishes only the explicitly selected draft', async () => {
    expect(await wiki.publishWikiAction(wikiForm({ revisionId: 'wiki-r2' }))).toContain('published=1'); expect(requests[0]).toMatchObject({ method: 'POST', path: `/api/catalog/wiki/constitution/${id}/publish`, body: { revisionId: 'wiki-r2' } });
    status = 409; expect(await wiki.publishWikiAction(wikiForm({ revisionId: 'stale' }))).toContain('error=1');
  });
  it('returns an embedded Wiki save to the same editor session and tab', async () => {
    const destination = await wiki.saveWikiAction(wikiForm({ returnTo: `/editor?versionId=${id}&sessionId=session-one&scope=article` }));
    const url = new URL(destination, 'http://atlas.local');
    expect(url.pathname).toBe('/editor'); expect(url.searchParams.get('sessionId')).toBe('session-one');
    expect(url.searchParams.get('tab')).toBe('wiki'); expect(url.searchParams.get('wikiStatus')).toBe('saved');
    expect(requests).toHaveLength(1);
  });
  it.each(['https://attacker.example/editor?sessionId=one&versionId=two', '//attacker.example', '/admin/users', '/editor?versionId=one'])('ignores an unsafe or unrelated Wiki return destination %s', async returnTo => {
    expect(await wiki.saveWikiAction(wikiForm({ returnTo }))).toBe(`/editor/wiki/constitution/${id}?code=XA&saved=1`);
  });
  it('pins retained images to the saved draft and removes the selected image', async () => {
    const data = wikiForm({ images: JSON.stringify([{ documentId: 'keep', revision: 2, alt: 'Old alt' }, { documentId: 'remove', revision: 1, alt: 'Remove' }]), 'remove-remove': 'on', 'alt-keep': ' Official seal ', 'placement-keep': 'before_body' });
    expect(await wiki.saveWikiAction(data)).toContain('saved=1');
    expect(requests[0].body).toMatchObject({ images: [expect.objectContaining({ documentId: 'keep', revision: 2, alt: 'Official seal', placement: 'before_body' })] });
    expect(requests[1].path).toBe('/api/document/documents/keep?revision=2');
    expect(requests[2]).toMatchObject({ path: `/api/document/links/constitution_wiki/${id}`, body: { documentId: 'keep', revisionId: 'keep-r2', scopeRevisionId: 'wiki-r2' } });
  });
  it('requires alternative text before creating a newly uploaded image', async () => {
    const data = wikiForm(); data.set('imageFile', new File(['pixels'], 'seal.png', { type: 'image/png' })); expect(await wiki.saveWikiAction(data)).toContain('error=1'); expect(requests).toEqual([]);
  });
  it('validates the target before issuing requests', async () => {
    await expect(wiki.saveWikiAction(wikiForm({ targetType: 'arbitrary' }))).rejects.toThrow('Invalid wiki target'); expect(requests).toEqual([]);
  });
});

describe('reviewed imports enforce the role and decision boundaries', () => {
  it('stages a valid import without approving or publishing it', async () => {
    responseBody = { id: 'job/one' }; expect(await imports.createImportAction(form({ payload: JSON.stringify(payload) }))).toBe('/editor?importJobId=job%2Fone'); expect(requests).toHaveLength(1); expect(requests[0]).toMatchObject({ path: '/api/ingestion/import-jobs', body: payload });
  });
  it.each([['{', 'json'], ['{}', 'invalid']])('rejects invalid import input before any write', async (raw, error) => {
    expect(await imports.createImportAction(form({ payload: raw }))).toBe(`/admin/import?error=${error}`); expect(requests).toEqual([]);
  });
  it('creates a setup proposal separately from a full import', async () => {
    responseBody = { id: 'proposal' }; expect(await imports.createSetupProposalAction(form({ proposal: JSON.stringify({ sampleRoots: [] }) }))).toBe('/admin/import/setup/proposal'); expect(requests[0].path).toBe('/api/ingestion/import-setup-proposals');
  });
  it.each([['prepare', 'editor'], ['confirm-outline', 'editor'], ['approve', 'reviewer'], ['reject', 'reviewer'], ['publish', 'publisher']])('allows %s only for the documented %s role', async (action, role) => {
    const data = form({ jobId: 'job', action, reason: 'Checked against the official source.' });
    vi.mocked(currentUser).mockResolvedValue({ id: role, email: 'staff@example.test', roles: [role], stepUpFresh: true }); expect(await imports.transitionImportAction(data)).toBe('/editor?importJobId=job'); expect(requests[0]).toMatchObject({ path: `/api/ingestion/import-jobs/job/${action}`, method: 'POST' });
    requests.length = 0; vi.mocked(currentUser).mockResolvedValue({ id: 'viewer', email: 'viewer@example.test', roles: ['viewer'] }); expect(await imports.transitionImportAction(data)).toContain('error=forbidden'); expect(requests).toEqual([]);
  });
  for (const [action, requiredRole] of [['prepare', 'editor'], ['confirm-outline', 'editor'], ['approve', 'reviewer'], ['reject', 'reviewer'], ['publish', 'publisher']]) {
    it.each(['editor', 'reviewer', 'publisher', 'viewer'].filter(role => role !== requiredRole))(`rejects %s attempting ${action} without ${requiredRole} capability`, async role => {
      vi.mocked(currentUser).mockResolvedValue({ id: role, email: 'staff@example.test', roles: [role], stepUpFresh: true });
      expect(await imports.transitionImportAction(form({ jobId: 'job', action, reason: 'Checked against the official source.' }))).toContain('error=forbidden'); expect(requests).toEqual([]);
    });
  }
  it('requires a review reason and fresh proof before publication', async () => {
    expect(await imports.transitionImportAction(form({ jobId: 'job', action: 'reject', reason: 'short' }))).toContain('error=reason');
    vi.mocked(currentUser).mockResolvedValue({ id: 'publisher', email: 'publisher@example.test', roles: ['publisher'], stepUpFresh: false });
    expect(await imports.transitionImportAction(form({ jobId: 'job', action: 'publish' }))).toContain('/account/step-up?'); expect(requests).toEqual([]);
  });
  it.each([[401, {}, '/login?'], [409, { code: 'approved_snapshot_changed' }, 'error=approved_snapshot_changed'], [403, { error: 'Fresh authenticator confirmation required' }, '/account/step-up?']])('preserves the rejection for transition status %s', async (code, body, destination) => {
    status = Number(code); responseBody = body;
    expect(await imports.transitionImportAction(form({ jobId: 'job', action: 'publish' }))).toContain(String(destination)); expect(requests).toHaveLength(1);
  });
});

describe('lifecycle records require publication capability', () => {
  it.each(['editor', 'reviewer', 'viewer'])('rejects %s before recording an event', async role => {
    vi.mocked(currentUser).mockResolvedValue({ id: role, email: 'staff@example.test', roles: [role] }); await expect(lifecycle.appendLifecycleAction(form({}))).rejects.toThrow('redirect:/editor'); expect(requests).toEqual([]);
  });
  it('records an approximate lifecycle event without changing constitutional text', async () => {
    await expect(lifecycle.appendLifecycleAction(form({ constitutionId: id, code: 'XA', eventType: 'adopted', eventDate: '1949-01-01', dateCertainty: 'approximate', note: ' Archival wording ', sourceUrl: ' https://archive.example/record ' }))).rejects.toThrow('saved=1');
    expect(requests[0].body).toEqual({ eventType: 'adopted', eventDate: '1949-01-01', dateCertainty: 'approximate', note: 'Archival wording', sourceUrl: 'https://archive.example/record' }); expect(requests).toHaveLength(1);
  });
  it('records scoped provision events with the selected source snapshot and unit identities', async () => {
    await expect(lifecycle.appendProvisionAction(form({ constitutionId: id, code: 'XA', sourceVersionId: 'snapshot', eventType: 'deferred', eventDate: '1949-01-01', logicalUnitIds: ['unit-1', 'unit-2'] }))).rejects.toThrow('saved=1'); expect(requests[0].body).toMatchObject({ sourceVersionId: 'snapshot', logicalUnitIds: ['unit-1', 'unit-2'] });
    status = 409; await expect(lifecycle.appendProvisionAction(form({ constitutionId: id, code: 'XA', sourceVersionId: 'snapshot' }))).rejects.toThrow('error=1');
  });
});
