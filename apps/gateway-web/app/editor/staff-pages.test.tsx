// EDIT-1/READ-1: Editorial role matrix and ADR 0005; actual workspace and form rendering.
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cookies } from 'next/headers';
import * as api from '../../lib/api';
import * as editor from '../../lib/editor-api';
import * as amendments from '../../lib/amendment-editor-api';
import { currentUser } from '../../lib/session';
import { cookieJar } from '../../test/server-boundary';
import { article, countryFixture, original, correction, nextLaw, instrument } from '../../test/reader-fixtures';
import EditorPage from './page';
import History from './history/page';
import Amendments from './amendments/page';
import Amendment from './amendments/[id]/page';

vi.mock('../../lib/api', async originalModule => ({ ...await originalModule<typeof import('../../lib/api')>(), listCountries: vi.fn(), getCountry: vi.fn(), getVersion: vi.fn(), getVersionSettings: vi.fn(), listAllUnits: vi.fn(), listAllArticles: vi.fn(), getArticle: vi.fn(), getUnit: vi.fn(), listConstitutionVersions: vi.fn(), listConstitutionAmendments: vi.fn() }));
vi.mock('../../lib/editor-api', async originalModule => ({ ...await originalModule<typeof import('../../lib/editor-api')>(), getDraftPreview: vi.fn(), getStructuredDraft: vi.fn(), getEditorDiffReview: vi.fn() }));
vi.mock('../../lib/amendment-editor-api', async originalModule => ({ ...await originalModule<typeof import('../../lib/amendment-editor-api')>(), getAmendment: vi.fn(), listRevisions: vi.fn(), getAmendmentDiffReview: vi.fn() }));
vi.mock('../../lib/session', () => ({ SESSION_COOKIE: 'ca_session', currentUser: vi.fn(), requireSessionBearer: async () => 'Bearer staff-session' }));
vi.mock('../../lib/server-locale', () => ({ currentLocale: async () => 'en' }));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); }, notFound: () => { throw new Error('not-found'); }, useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
// Async child boundaries are separately verified; React 18 static rendering cannot await them.
vi.mock('./EditorLanding', () => ({ EditorLanding: ({ email }: { email: string }) => <p>Session list for {email}</p> }));
vi.mock('./ImportReview', () => ({ ImportReview: ({ jobId }: { jobId: string }) => <p>Import review {jobId}</p> }));
vi.mock('./documents/DocumentLinks', () => ({ DocumentLinks: () => null }));
let preview: editor.DraftPreview;
const user = (role: string) => ({ id: 'author', email: 'author@example.test', roles: [role] });
const search = (params: Record<string, string> = {}) => ({ searchParams: Promise.resolve(params) });
const detail = (id = 'instrument') => ({ ...search(), params: Promise.resolve({ id }) });
beforeEach(() => {
  vi.mocked(currentUser).mockResolvedValue(user('editor')); vi.mocked(cookies).mockResolvedValue(cookieJar({ ca_session: 'staff-session' }) as unknown as Awaited<ReturnType<typeof cookies>>);
  vi.mocked(api.listCountries).mockResolvedValue([{ id: 'country', isoCode: 'XA', name: 'Test Republic', versionCount: 2 }]); vi.mocked(api.getCountry).mockResolvedValue(countryFixture());
  vi.mocked(api.getVersion).mockResolvedValue({ ...original, constitutionId: 'charter', publicationStatus: 'published' }); vi.mocked(api.getVersionSettings).mockResolvedValue(null);
  const unit = article('old-1', '1', 'Authored source wording.');
  vi.mocked(api.listAllUnits).mockResolvedValue([unit]); vi.mocked(api.listAllArticles).mockResolvedValue([unit]); vi.mocked(api.getUnit).mockResolvedValue({ ...unit, body: unit.body!, title: unit.title ?? '' }); vi.mocked(api.getArticle).mockResolvedValue({ ...unit, body: unit.body!, title: unit.title ?? '' });
  vi.mocked(api.listConstitutionVersions).mockResolvedValue([original, correction, nextLaw]); vi.mocked(api.listConstitutionAmendments).mockResolvedValue([instrument]);
  preview = { session: { id: 'session', actorId: 'author', versionId: original.id, status: 'open', revisionCount: 1, hopKind: 'editorial_correction' }, latestSnapshot: null, drafts: [{ articleId: 'old-1', title: 'Corrected provision', body: 'Corrected draft wording.' }], publishComment: 'Corrected against the official archive.' };
  vi.mocked(editor.getDraftPreview).mockImplementation(async () => preview); vi.mocked(editor.getStructuredDraft).mockResolvedValue(null);
  vi.mocked(amendments.getAmendment).mockResolvedValue({ ...instrument, reviewStatus: 'ok' }); vi.mocked(amendments.listRevisions).mockResolvedValue([{ id: 'instrument-r1', title: 'Voting reform', changes: [], createdAt: '1956-01-01', sourceVersionId: original.id, targetVersionId: nextLaw.id }]);
});
afterEach(() => vi.clearAllMocks());
const html = async (page: ReturnType<typeof EditorPage>) => renderToStaticMarkup(await page);

describe('editorial workspace capabilities', () => {
  it.each([['editor', 'open', 'review'], ['reviewer', 'reviewing', 'approve'], ['publisher', 'approved', 'publish']] as const)('offers the next %s command only in %s state', async (role, state, command) => {
    vi.mocked(currentUser).mockResolvedValue(user(role)); preview.session.status = state;
    const output = await html(EditorPage(search({ sessionId: 'session' })));
    const dom = new DOMParser().parseFromString(output, 'text/html'); const commands = [...dom.querySelectorAll<HTMLInputElement>('input[name="command"]')].map(input => input.value);
    expect(commands).toContain(command);
    for (const forbidden of ['review', 'approve', 'publish'].filter(item => item !== command)) expect(commands).not.toContain(forbidden);
    expect(output).toContain('Corrected draft wording.');
  });
  it('does not offer another review or publication for an already published session', async () => {
    preview.session.status = 'published'; preview.newVersionId = 'published-copy'; preview.searchIndexStatus = 'pending'; vi.mocked(currentUser).mockResolvedValue(user('admin'));
    const output = await html(EditorPage(search({ sessionId: 'session' }))); expect(output).toContain('/countries/XA/versions/published-copy'); expect(output).not.toContain('value="publish"'); expect(output).not.toContain('value="approve"');
  });
  it('does not offer editorial commands to a viewer', async () => {
    vi.mocked(currentUser).mockResolvedValue(user('viewer')); const output = await html(EditorPage(search({ sessionId: 'session' }))); expect(output).not.toContain('/editor/command'); expect(editor.getDraftPreview).not.toHaveBeenCalled();
  });
  it('preserves a selected session through sign-in', async () => {
    vi.mocked(currentUser).mockResolvedValue(null); await expect(EditorPage(search({ sessionId: 'session' }))).rejects.toThrow('next=%2Feditor%3FsessionId%3Dsession');
  });
  it('returns to the session list rather than fabricating a missing draft', async () => {
    vi.mocked(editor.getDraftPreview).mockResolvedValue(null); const output = await html(EditorPage(search({ sessionId: 'missing' }))); expect(output).toContain('Session list for author@example.test'); expect(output).not.toContain('value="publish"');
  });
  it('keeps import review distinct from text editing', async () => {
    expect(await html(EditorPage(search({ importJobId: 'staged-import' })))).toContain('Import review staged-import'); expect(editor.getDraftPreview).not.toHaveBeenCalled();
  });
  it('blocks review submission until an editorial correction has a reason', async () => {
    preview.publishComment = null; const output = await html(EditorPage(search({ sessionId: 'session' })));
    const dom = new DOMParser().parseFromString(output, 'text/html'); const review = dom.querySelector('input[name="command"][value="review"]')?.closest('form'); expect(review?.querySelector('button')?.disabled).toBe(true);
  });
});

describe('legal-change lists and staff history', () => {
  it('groups corrections under their legal identity and links the current transcription', async () => {
    const output = await html(History(search({ constitutionId: 'charter' }))); expect(output).toContain('/versions/correction-1949'); expect(output).toContain('Editorial correction'); expect(output).toContain('Voting reform'); expect(output).toContain('Needs review');
    expect(api.listConstitutionVersions).toHaveBeenCalledWith('charter', { listing: 'all', authorization: 'Bearer staff-session' });
  });
  it.each(['editor', 'reviewer', 'publisher'])('keeps creation controls limited to writers in the %s queue', async role => {
    vi.mocked(currentUser).mockResolvedValue(user(role)); const output = await html(Amendments(search())); expect(output.includes('/editor/amendments/new?')).toBe(role === 'editor'); expect(output).toContain('Voting reform');
  });
  it('filters the quote-review queue without treating reviewed records as pending', async () => {
    vi.mocked(api.listConstitutionAmendments).mockResolvedValue([instrument, { ...instrument, id: 'reviewed', title: 'Already reviewed reform', reviewStatus: 'ok' }]);
    const output = await html(Amendments(search({ review: 'needs_review' }))); expect(output).toContain('Voting reform'); expect(output).not.toContain('Already reviewed reform');
  });
  it('does not expose private history or legal-change queues to viewers', async () => {
    vi.mocked(currentUser).mockResolvedValue(user('viewer'));
    expect(await html(History(search()))).not.toContain('Voting reform'); expect(await html(Amendments(search()))).not.toContain('Voting reform'); expect(api.listConstitutionAmendments).not.toHaveBeenCalled();
  });
  it('renders an explicit empty history if catalogue discovery fails', async () => {
    vi.mocked(api.listCountries).mockRejectedValue(new Error('offline')); const output = await html(History(search())); expect(output).toContain('role="alert"'); expect(output).not.toContain('/versions/correction-1949');
  });
  it('treats an unknown legal-change identifier as not-found', async () => {
    vi.mocked(amendments.getAmendment).mockResolvedValue(null); await expect(Amendment(detail('missing'))).rejects.toThrow('not-found');
  });
  it('does not expose draft-saving or publication controls to a read-only reviewer', async () => {
    vi.mocked(currentUser).mockResolvedValue(user('reviewer'));
    const output = await html(Amendment(detail())); expect(output).toContain('Voting reform');
    const dom = new DOMParser().parseFromString(output, 'text/html'); expect(dom.querySelector('input[name="command"][value="amendment-publish"]')).toBeNull(); const saveForm = dom.querySelector('input[name="command"][value="amendment-save"]')?.closest('form'); expect(saveForm?.querySelector('button[type="submit"], button:not([type])')).toBeNull(); expect(dom.querySelector<HTMLInputElement>('input[name="title"]')?.disabled).toBe(true);
  });
  it('opens a new legal-change draft without creating a new legal edition', async () => {
    const output = await html(Amendment({ ...search({ constitutionId: 'charter' }), params: Promise.resolve({ id: 'new' }) })); expect(output).toContain('name="title"'); expect(amendments.getAmendment).not.toHaveBeenCalled(); expect(output).not.toContain('value="publish"');
  });
});
