import { afterEach, describe, expect, it, vi } from 'vitest';
import { isImportRequest, parseImportJson, ImportTransitionError, transitionImportJob } from './ingestion-api';

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
describe('import transition errors', () => {
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
