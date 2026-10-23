import { describe, expect, it } from 'vitest';
import { isImportRequest, parseImportJson } from './ingestion-api';

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
