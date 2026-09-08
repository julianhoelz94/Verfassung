import { describe, expect, it } from 'vitest';
import { safeReturnTo } from './return-to';

describe('safeReturnTo', () => {
  it('keeps same-site paths with query strings', () => {
    expect(safeReturnTo('/editor?versionId=v1&sessionId=s1')).toBe('/editor?versionId=v1&sessionId=s1');
    expect(safeReturnTo('/account', '/x')).toBe('/account');
  });

  it('rejects protocol-relative, backslash, and absolute URLs', () => {
    expect(safeReturnTo('//evil.example/x')).toBe('/');
    expect(safeReturnTo('/\\evil.example/x')).toBe('/');
    expect(safeReturnTo('https://evil.example/x', '/account')).toBe('/account');
    expect(safeReturnTo('javascript:alert(1)', '/account')).toBe('/account');
  });

  it('rejects empty and relative input', () => {
    expect(safeReturnTo('', '/account')).toBe('/account');
    expect(safeReturnTo('relative/path')).toBe('/');
  });
});
