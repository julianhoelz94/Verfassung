import { afterEach, describe, expect, it, vi } from 'vitest';
import { archiveImportJob, isImportRequest, listMyImportJobs, parseImportJson, ImportTransitionError, transitionImportJob, transitionSetupProposal } from './ingestion-api';

const valid = {
  isoCode: 'US',
  countryName: 'United States',
  constitutionSlug: 'constitution',
  constitutionTitle: 'Constitution of the United States',
  versionLabel: '1789',
  articles: [{ articleNumber: 'I', title: 'Legislative Power', body: '', sortOrder: 1 }],
};

describe('isImportRequest', () => {
  it('accepts the required import-job fields', () => {
    expect(isImportRequest(valid)).toBe(true);
    expect(isImportRequest(parseImportJson(JSON.stringify(valid)))).toBe(true);
  });

  it('accepts ordered roots and rejects ambiguous formats', () => {
    expect(isImportRequest({ ...valid, articles: [], roots: [{ kind: 'part', content: [] }] })).toBe(true);
    expect(isImportRequest({ ...valid, roots: [{ kind: 'part', content: [] }] })).toBe(false);
  });

  it('accepts jurisdiction identity without a fake country code and rejects ambiguous selectors', () => {
    const regional = { ...valid, isoCode: undefined, countryName: undefined, jurisdictionId: '01900000-0000-4000-8000-000000000009' };
    expect(isImportRequest(regional)).toBe(true);
    expect(isImportRequest({ ...regional, isoCode: 'DE' })).toBe(false);
    expect(isImportRequest({ ...regional, jurisdictionId: '' })).toBe(false);
  });

  it('rejects missing articles or blank required strings', () => {
    expect(isImportRequest({ ...valid, articles: [] })).toBe(false);
    expect(isImportRequest({ ...valid, isoCode: ' ' })).toBe(false);
    expect(isImportRequest({ countryName: 'United States' })).toBe(false);
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('personal import archive', () => {
  it('loads every page of owned archived work without mixing in the active list', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({ id: String(index) }));
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(firstPage)).mockResolvedValueOnce(Response.json([{ id: 'last' }]));
    vi.stubGlobal('fetch', fetchMock);
    await expect(listMyImportJobs('Bearer author', true)).resolves.toHaveLength(101);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [index, [url, init]] of fetchMock.mock.calls.entries()) {
      expect(Object.fromEntries(new URL(String(url)).searchParams)).toEqual({ mine: 'true', archived: 'true', limit: '100', offset: String(index * 100) });
      expect(init?.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer author' }));
    }
  });

  it('does not present an unavailable archive as an empty list', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 })));
    await expect(listMyImportJobs('Bearer author', false)).rejects.toThrow('Imports unavailable');
  });

  it.each([true, false])('accepts bodyless archive/restore responses (archived=%s)', async archived => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(archiveImportJob('job', archived, 'Bearer author')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/import-jobs\/job\/archive$/), expect.objectContaining({
      method: 'POST', body: JSON.stringify({ archived }), headers: expect.objectContaining({ Authorization: 'Bearer author' }),
    }));
  });

  it('propagates a forbidden archive change rather than reporting success', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 403 })));
    await expect(archiveImportJob('job', true, 'Bearer another-user')).rejects.toThrow('Import archive failed');
  });
});

describe('import transition errors', () => {
  it.each(['FOOTNOTE_NOT_AT_END', 'FOOTNOTE_MARK_CARDINALITY', 'UNIT_REFERENCE_TARGET', 'INLINE_REFERENCE', 'TEXT_MARK_RANGE', 'TEXT_LINE_BREAKS', 'publication_validation_failed'])('keeps actionable content validation %s distinct from an availability failure', async code => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ code, path: 'roots[1].content[2]' }, { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(transitionImportJob('job', 'publish', 'Bearer session')).rejects.toMatchObject({ code });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('preserves the safe configuration error instead of reporting user permissions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ code: 'publication_not_configured' }, { status: 503 })));
    await expect(transitionImportJob('job', 'publish', 'Bearer session')).rejects.toMatchObject({ code: 'publication_not_configured' });
  });
  it('recognizes an expired MFA confirmation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'Fresh authenticator confirmation required' }, { status: 403 })));
    await expect(transitionImportJob('job', 'publish', 'Bearer session')).rejects.toMatchObject({ code: 'mfa' });
  });
  it('does not expose arbitrary upstream details or treat a conflict as a service outage', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ code: 'private-server-detail', error: 'private-value' }, { status: 409 })));
    await expect(transitionImportJob('job', 'publish', 'Bearer session')).rejects.toMatchObject({ code: 'conflict', message: 'conflict' });
  });
  it('normalizes a network failure without retrying the publication', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('network error'));
    vi.stubGlobal('fetch', fetch);
    await expect(transitionImportJob('job', 'publish', 'Bearer session')).rejects.toBeInstanceOf(ImportTransitionError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});


describe('setup confirmation recovery', () => {
  it('preserves a safe creation rejection so a correctable proposal is not described as stale', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ code: 'setup_creation_rejected' }, { status: 409 })));
    await expect(transitionSetupProposal('proposal', 'confirm', 'Bearer editor', 4)).rejects.toMatchObject({ code: 'creation_rejected' });
  });
  it('distinguishes an active confirmation from a stale reviewed revision', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ code: 'setup_confirmation_running' }, { status: 409 })));
    await expect(transitionSetupProposal('proposal', 'confirm', 'Bearer editor', 4)).rejects.toMatchObject({ code: 'running' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ code: 'unrelated' }, { status: 409 })));
    await expect(transitionSetupProposal('proposal', 'confirm', 'Bearer editor', 4)).rejects.toMatchObject({ code: 'stale' });
  });
});
