import { describe, expect, it } from 'vitest';
import { httpUrl, provenanceLabel, verificationLabel } from './provenance';

describe('httpUrl', () => {
  it('keeps http(s) links and rejects other schemes', () => {
    expect(httpUrl('https://www.gesetze-im-internet.de/gg/')).toBe(
      'https://www.gesetze-im-internet.de/gg/',
    );
    expect(httpUrl('javascript:alert(1)')).toBeNull();
    expect(httpUrl('not-a-url')).toBeNull();
  });
});

describe('provenance labels', () => {
  it('never calls imported or demo text official', () => {
    expect(provenanceLabel('official')).toBe('Official text');
    expect(provenanceLabel('imported')).toContain('not an official publication');
    expect(provenanceLabel('demo')).toContain('not official');
    expect(provenanceLabel('imported')).not.toMatch(/^Official/);
  });

  it('describes verification state', () => {
    expect(
      verificationLabel({ verificationState: 'unverified', verifiedBy: null, verifiedAt: null }),
    ).toBe('Not independently verified');
    expect(
      verificationLabel({
        verificationState: 'verified',
        verifiedBy: 'catalog-editor@example.local',
        verifiedAt: '2022-12-19T00:00:00Z',
      }),
    ).toBe('Verified by catalog-editor@example.local on 2022-12-19');
  });
});
