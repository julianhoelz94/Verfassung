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
