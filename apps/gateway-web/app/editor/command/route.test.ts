// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: 'test-session' }) }) }));
vi.mock('../../../lib/session', () => ({ SESSION_COOKIE: 'ca_session' }));

import { POST } from './route';
import { editorErrorMessage } from '../../../lib/editor-api';

const context = {
  versionId: 'version-1', sessionId: 'session-1', articleId: 'article-1', scope: 'passage', selectedNode: 'node-1',
};

function publishRequest() {
  return new NextRequest('http://localhost/editor/command', {
    method: 'POST',
    headers: { origin: 'http://localhost', host: 'localhost' },
    body: new URLSearchParams({ ...context, command: 'publish', hopKind: 'editorial_correction' }),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('publication command outcomes', () => {
  it.each([
    new DOMException('Request timed out', 'TimeoutError'),
    new TypeError('socket closed after sending the command'),
  ])('returns to the same session with a check-status message when the response is lost: %s', async (error) => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(error);
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(publishRequest());
    expect(response.status).toBe(303);
    const destination = new URL(response.headers.get('location')!);
    expect(destination.origin + destination.pathname).toBe('http://localhost/editor');
    expect(Object.fromEntries(destination.searchParams)).toEqual({ ...context, error: 'publish_unconfirmed' });
    expect(editorErrorMessage(destination.searchParams.get('error')!, 'en')).toMatch(/could not be confirmed.*Reload this session/);
    expect(editorErrorMessage(destination.searchParams.get('error')!, 'de')).toMatch(/nicht bestätigt.*Laden Sie diese Sitzung neu/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('still navigates to the confirmed published result after a successful response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ newVersionId: 'version-2', newVersionLabel: '1.2' }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(publishRequest());
    expect(response.status).toBe(303);
    const destination = new URL(response.headers.get('location')!);
    expect(Object.fromEntries(destination.searchParams)).toEqual({
      ...context, published: '1', newVersionId: 'version-2', newVersionLabel: '1.2',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('still requires a fresh authentication check when the service asks for it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json({ code: 'step_up_required' }, { status: 403 })));

    const response = await POST(publishRequest());
    const destination = new URL(response.headers.get('location')!);
    expect(response.status).toBe(303);
    expect(destination.pathname).toBe('/account/step-up');
    const returnTo = new URL(destination.searchParams.get('returnTo')!, destination.origin);
    expect(returnTo.pathname).toBe('/editor');
    expect(Object.fromEntries(returnTo.searchParams)).toEqual(context);
  });
});

describe('source evidence commands', () => {
  function request(command: string, fields: Record<string, string> = {}, origin = 'http://localhost') {
    return new NextRequest('http://localhost/editor/command', { method: 'POST',
      headers: { origin, host: 'localhost', accept: 'application/json' },
      body: new URLSearchParams({ ...context, scope: 'sources', command, ...fields }),
    });
  }
  it('opens a correction directly from the source block', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: 'source-session' }));
    vi.stubGlobal('fetch', fetchMock);
    const response = await POST(request('open-sources'));
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({ versionId: 'version-1', hopKind: 'editorial_correction' });
    expect(response.headers.get('location')).toContain('scope=sources');
  });
  it('preserves stale revision errors as JSON so the form retains input', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json({ code: 'stale_source_evidence' }, { status: 409 })));
    const response = await POST(request('source-evidence', { expectedRevision: '1', description: 'Revised source description', reason: 'Clarify' }));
    expect(await response.json()).toEqual({ key: 'stale_source_evidence' });
  });
  it('saves one description while keeping the correction reason outside the source data', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ sourceEvidenceRevisions: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await POST(request('source-evidence', { expectedRevision: '1', description: '# Archive\n\nFree source text', reason: 'Correct citation' }));
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({ expectedRevision: 1, evidence: { description: '# Archive\n\nFree source text', datePrecision: 'unknown' }, reason: 'Correct citation' });
  });
  it.each(['review', 'approve', 'publish'])('pins the source revision for %s', async command => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({}));
    vi.stubGlobal('fetch', fetchMock);
    await POST(request(command, { sourceEvidenceRevision: '2', hopKind: 'editorial_correction' }));
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string).sourceEvidenceRevision).toBe(2);
  });
  it('rejects cross-site source writes before forwarding them', async () => {
    const fetchMock = vi.fn<typeof fetch>(); vi.stubGlobal('fetch', fetchMock);
    expect((await POST(request('source-evidence', {}, 'https://untrusted.example'))).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// EDIT-1/API-1: native command contract; expected outcomes come from the editorial workflow.
describe('draft, review and legal-change command boundaries', () => {
  function request(command: string, fields: Record<string, string> = {}, headers: Record<string, string> = { origin: 'http://localhost', host: 'localhost' }) {
    return new NextRequest('http://localhost/editor/command', { method: 'POST', headers, body: new URLSearchParams({ ...context, command, ...fields }) });
  }
  const commands = [
    { command: 'open', fields: { hopKind: 'legal' }, path: '/edit-sessions', body: { versionId: 'version-1', hopKind: 'legal' }, result: { id: 'opened' }, destination: 'sessionId=opened' },
    { command: 'save', fields: { title: 'Authored title', body: 'Authored wording' }, path: '/edit-sessions/session-1/saves', body: { articleId: 'article-1', title: 'Authored title', body: 'Authored wording' }, destination: 'saved=1' },
    { command: 'structured-save', fields: { structuredDraft: JSON.stringify({ expectedGeneration: 4, operations: [{ type: 'set_title', logicalId: 'unit', title: 'Authored title' }] }) }, path: '/edit-sessions/session-1/structured-saves', body: { expectedGeneration: 4, operations: [{ type: 'set_title', logicalId: 'unit', title: 'Authored title' }] }, destination: 'saved=1' },
    { command: 'details', fields: { hopKind: 'editorial_correction', comment: 'Corrected against the archive.' }, path: '/edit-sessions/session-1/publish-details', body: { comment: 'Corrected against the archive.' }, destination: 'detailsSaved=1' },
    { command: 'review', fields: {}, path: '/edit-sessions/session-1/review', body: {}, destination: 'reviewed=1' },
    { command: 'approve', fields: {}, path: '/edit-sessions/session-1/approval', body: {}, destination: 'approved=1' },
    { command: 'source-evidence-changes', fields: { expectedRevision: '4', reason: 'Source attribution needs correction.' }, path: '/edit-sessions/session-1/source-evidence/changes-requested', body: { expectedRevision: 4, reason: 'Source attribution needs correction.' }, destination: 'sessionId=session-1' },
  ];
  for (const spec of commands) it(`keeps ${spec.command} separate from publication and preserves its context`, async () => {
    const upstream = vi.fn<typeof fetch>().mockResolvedValue(Response.json(spec.result ?? {})); vi.stubGlobal('fetch', upstream);
    const response = await POST(request(spec.command, spec.fields)); expect(response.status).toBe(303); expect(response.headers.get('location')).toContain(spec.destination);
    expect(new URL(String(upstream.mock.calls[0][0])).pathname).toBe('/api/editor' + spec.path); expect(JSON.parse(String(upstream.mock.calls[0][1]?.body))).toEqual(spec.body); expect(upstream).toHaveBeenCalledTimes(1);
  });
  it.each(['load', 'open', 'publish', 'structured-save', 'unknown'])('rejects invalid %s input without an upstream write', async command => {
    const upstream = vi.fn<typeof fetch>(); vi.stubGlobal('fetch', upstream);
    const response = await POST(request(command, { sessionId: '', hopKind: 'official_errata', structuredDraft: '{}' })); expect(response.headers.get('location')).toMatch(/error=(invalid|session_id)/); expect(upstream).not.toHaveBeenCalled();
  });
  it('loads a selected session without mutating it', async () => {
    const upstream = vi.fn<typeof fetch>(); vi.stubGlobal('fetch', upstream); const response = await POST(request('load')); expect(response.headers.get('location')).toContain('sessionId=session-1'); expect(upstream).not.toHaveBeenCalled();
  });
  it('keeps legal publication details separate from an editorial correction reason', async () => {
    const upstream = vi.fn<typeof fetch>().mockResolvedValue(Response.json({})); vi.stubGlobal('fetch', upstream);
    await POST(request('details', { hopKind: 'legal', recordTitle: 'Voting reform', recordComment: 'Enacted law', documentUrl: 'https://archive.example/law', documentLabel: 'Gazette', changesJson: '[]' }));
    expect(JSON.parse(String(upstream.mock.calls[0][1]?.body))).toEqual({ changeRecord: { title: 'Voting reform', comment: 'Enacted law', documents: [{ url: 'https://archive.example/law', label: 'Gazette' }], changes: [] } });
  });
  it.each([['amendment-withdraw', 'withdraw', 'withdrawn'], ['amendment-publish', 'publish', 'published'], ['amendment-confirm', 'confirm-quotes', 'confirmed']])('routes %s to the selected record only', async (command, path, outcome) => {
    const upstream = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: 'instrument' })); vi.stubGlobal('fetch', upstream);
    const response = await POST(request(command, { amendmentId: 'instrument/id' })); expect(new URL(String(upstream.mock.calls[0][0])).pathname).toBe(`/api/amendment/amendments/instrument%2Fid/${path}`); expect(response.headers.get('location')).toContain(`/editor/amendments/instrument%2Fid?${outcome}=1`);
  });
  it('does not publish a legal-change record that does not exist yet', async () => {
    const upstream = vi.fn<typeof fetch>(); vi.stubGlobal('fetch', upstream); const response = await POST(request('amendment-publish', { amendmentId: 'new' })); expect(response.headers.get('location')).toContain('/editor/amendments?error=invalid'); expect(upstream).not.toHaveBeenCalled();
  });
  it.each([['new', '/constitutions/charter/amendments'], ['instrument', '/amendments/instrument/revisions']])('saves %s as a draft revision without publishing it', async (id, path) => {
    const upstream = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: 'instrument' })); vi.stubGlobal('fetch', upstream);
    const response = await POST(request('amendment-save', { amendmentId: id, constitutionId: 'charter', title: 'Voting reform', comment: 'Enacted instrument', changesJson: '[]' })); expect(new URL(String(upstream.mock.calls[0][0])).pathname).toBe('/api/amendment' + path); expect(response.headers.get('location')).toContain('?saved=1');
  });
  it('preserves rejected legal-change edits at their selected record', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json({ code: 'forbidden' }, { status: 403 })));
    const response = await POST(request('amendment-save', { amendmentId: 'instrument', title: 'Voting reform', changesJson: '[]' })); expect(response.headers.get('location')).toContain('/editor/amendments/instrument?error=forbidden');
  });
  it.each(['https://foreign.example', 'not a URL'])('rejects an untrusted origin %s before making any write', async origin => {
    const upstream = vi.fn<typeof fetch>(); vi.stubGlobal('fetch', upstream); expect((await POST(request('save', {}, { origin, host: 'localhost' }))).status).toBe(403); expect(upstream).not.toHaveBeenCalled();
  });
  it('returns native redirects on the configured forwarded public origin', async () => {
    const upstream = vi.fn<typeof fetch>(); vi.stubGlobal('fetch', upstream); const response = await POST(request('load', {}, { 'x-forwarded-host': 'atlas.example', 'x-forwarded-proto': 'https' })); expect(response.headers.get('location')).toContain('https://atlas.example/editor?'); expect(upstream).not.toHaveBeenCalled();
  });
});
