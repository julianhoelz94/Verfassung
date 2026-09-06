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

  it('rejects missing articles or blank required strings', () => {
    expect(isImportRequest({ ...valid, articles: [] })).toBe(false);
    expect(isImportRequest({ ...valid, isoCode: ' ' })).toBe(false);
    expect(isImportRequest({ countryName: 'United States' })).toBe(false);
  });
});
