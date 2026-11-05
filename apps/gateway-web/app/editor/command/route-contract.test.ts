// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: 'test-session' }) }) }));
vi.mock('../../../lib/session', () => ({ SESSION_COOKIE: 'ca_session' }));

import { POST } from './route';

const context = { versionId: 'version', sessionId: 'session', scope: 'sources', selectedNode: 'node' };

/** Build actual native form requests so parser and redirect contracts stay under test. */
function request(command: string, fields: Record<string, string> = {}, query = '', accept = '') {
  return new NextRequest(`http://localhost/editor/command${query}`, {
    method: 'POST', headers: { origin: 'http://localhost', host: 'localhost', accept },
    body: new URLSearchParams({ ...context, command, ...fields }),
  });
}

/** Read redirect query values without depending on URL percent-encoding presentation. */
function outcome(response: Response) {
  return Object.fromEntries(new URL(response.headers.get('location')!).searchParams);
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('editor native command parsing contracts', () => {
  it('uses query command before the form command', async () => {
    const upstream = vi.fn<typeof fetch>(); vi.stubGlobal('fetch', upstream);
    const response = await POST(request('save', {}, '?command=load'));
    expect(outcome(response)).toEqual(context);
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each(['', 'constructor', '__proto__', 'toString'])('does not dispatch a form command when query command is %s', async command => {
    const upstream = vi.fn<typeof fetch>(); vi.stubGlobal('fetch', upstream);
    const response = await POST(request('save', {}, `?command=${command}`));
    expect(outcome(response)).toEqual({ ...context, error: 'invalid' });
    expect(upstream).not.toHaveBeenCalled();
  });

  it('does not parse a rejected cross-origin body', async () => {
    const incoming = request('save'); incoming.headers.set('origin', 'https://foreign.example');
    const read = vi.spyOn(incoming, 'formData').mockRejectedValue(new Error('must not read'));
    const response = await POST(incoming);
    expect(response.status).toBe(403); expect(read).not.toHaveBeenCalled();
  });

  it('propagates trusted form parsing failures rather than translating them into command errors', async () => {
    const incoming = request('save'); const failure = new Error('Malformed multipart');
    vi.spyOn(incoming, 'formData').mockRejectedValue(failure);
    await expect(POST(incoming)).rejects.toBe(failure);
  });

  it.each([['0', 0], ['01', 1], [' 2 ', 2], ['9007199254740991', 9007199254740991]])('preserves optional source revision %s as %s', async (raw, revision) => {
    const upstream = vi.fn<typeof fetch>().mockResolvedValue(Response.json({})); vi.stubGlobal('fetch', upstream);
    await POST(request('review', { sourceEvidenceRevision: String(raw) }));
    expect(JSON.parse(String(upstream.mock.calls[0][1]?.body))).toEqual({ sourceEvidenceRevision: revision });
  });

  it.each(['', '-1', '1.5', '1e2', '9007199254740992', 'invalid'])('omits an invalid optional source revision %s', async raw => {
    const upstream = vi.fn<typeof fetch>().mockResolvedValue(Response.json({})); vi.stubGlobal('fetch', upstream);
    await POST(request('review', { sourceEvidenceRevision: raw }));
    expect(JSON.parse(String(upstream.mock.calls[0][1]?.body))).toEqual({});
  });

  it.each(['', '-1', '1.5', '1e2', '9007199254740992'])('rejects an invalid mandatory source revision %s before writing', async raw => {
    const upstream = vi.fn<typeof fetch>(); vi.stubGlobal('fetch', upstream);
    const response = await POST(request('source-evidence', { expectedRevision: raw }, '', 'application/json'));
    expect(response.status).toBe(400); expect(await response.json()).toEqual({ key: 'source_evidence_invalid' });
    expect(upstream).not.toHaveBeenCalled();
  });

  it('validates publication changes even when no inline change-record title is supplied', async () => {
    const upstream = vi.fn<typeof fetch>(); vi.stubGlobal('fetch', upstream);
    const response = await POST(request('publish', { hopKind: 'editorial_correction', changesJson: '{' }));
    expect(outcome(response)).toEqual({ ...context, error: 'invalid' });
    expect(upstream).not.toHaveBeenCalled();
  });

  it('prioritizes step-up redirects over source-evidence JSON errors', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json({ code: 'step_up_required' }, { status: 403 })));
    const response = await POST(request('source-evidence', { expectedRevision: '0' }, '', 'application/json'));
    expect(response.status).toBe(303);
    const target = new URL(response.headers.get('location')!); expect(target.pathname).toBe('/account/step-up');
    expect(new URL(target.searchParams.get('returnTo')!, target.origin).searchParams.get('scope')).toBe('sources');
  });

  it('keeps source-evidence change requests as redirects even for JSON clients', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json({ code: 'stale_source_evidence' }, { status: 409 })));
    const response = await POST(request('source-evidence-changes', { expectedRevision: '0' }, '', 'application/json'));
    expect(response.status).toBe(303); expect(outcome(response)).toEqual({ ...context, error: 'stale_source_evidence' });
  });

  it('maps generic source-evidence rejection to a source-specific JSON error', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json({ code: 'bad_evidence' }, { status: 400 })));
    const response = await POST(request('source-evidence', { expectedRevision: '1' }, '', 'application/json'));
    expect(response.status).toBe(400); expect(await response.json()).toEqual({ key: 'source_evidence_invalid' });
  });

  it('retains constitution context on errors while creating a new amendment', async () => {
    const response = await POST(request('amendment-save', { amendmentId: 'new', constitutionId: 'charter', title: '' }));
    const target = new URL(response.headers.get('location')!);
    expect(target.pathname).toBe('/editor/amendments/new');
    expect(Object.fromEntries(target.searchParams)).toEqual({ error: 'title', constitutionId: 'charter' });
  });
});
