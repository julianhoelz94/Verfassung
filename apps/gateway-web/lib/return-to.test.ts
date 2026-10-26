import { describe, expect, it } from 'vitest';
import { loginHref, safeLoginReturnTo, safeReturnTo } from './return-to';

describe('safeReturnTo', () => {
  it('keeps same-site paths with query strings', () => {
    expect(safeReturnTo('/editor?versionId=v1&sessionId=s1')).toBe('/editor?versionId=v1&sessionId=s1');
    expect(safeReturnTo('/account', '/x')).toBe('/account');
    expect(safeReturnTo('/countries/DE?version=v1#article-5')).toBe('/countries/DE?version=v1#article-5');
  });

  it.each([
    '/parent/..//evil.example', '/parent%2f..%2f%2fevil.example', '/%2fexample.com', '/%5cexample.com', '/%252fexample.com',
    '/\t/evil.example', '/\n/evil.example', '/\r/evil.example', '/account\u0000', '/account\u007f',
    '/%0a/evil.example', '/%00account', '/%7faccount', '/%ZZ', `/${'a'.repeat(4096)}`,
  ])('rejects ambiguous or control-character redirect input: %j', (path) => {
    expect(safeReturnTo(path, '/account')).toBe('/account');
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

  it.each(['/.//evil.example/path', '/safe/..//evil.example/path', '/%2e//evil.example/path', '/safe/%2e%2e//evil.example/path'])(
    'rejects paths that normalize to a protocol-relative redirect: %s',
    (path) => expect(safeReturnTo(path, '/account')).toBe('/account'),
  );

  it('still normalizes ordinary same-site dot segments', () => {
    expect(safeReturnTo('/editor/../account?tab=security')).toBe('/account?tab=security');
  });
});

describe('login return navigation', () => {
  it.each(['/account#mcp-keys', '/editor?sessionId=s1&versionId=v1', '/oauth/authorize?client_id=client&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback'])('preserves the intended destination: %s', (path) => {
    expect(safeLoginReturnTo(path)).toBe(path);
    expect(new URL(loginHref(path), 'https://atlas.example').searchParams.get('next')).toBe(path);
  });

  it.each(['/login', '/login?next=/editor', '/login/mfa?enroll=1', '/logout', '/logout/', '/%6cogin', '/account/../login', '/login%2fmfa', '/%256cogin', '//evil.example', 'https://evil.example', ['one', 'two'], null])('avoids unsafe destinations and authentication loops: %j', (path) => {
    expect(safeLoginReturnTo(path, '/editor')).toBe('/editor');
  });

  it('retains query filters and repeated parameters through a protected-page redirect', () => {
    const href = loginHref('/editor', { sessionId: 's1', versionId: 'v1', q: 'A & B', tag: ['one', 'two'], absent: undefined });
    const next = new URL(href, 'https://atlas.example').searchParams.get('next')!;
    const destination = new URL(next, 'https://atlas.example');
    expect(destination.pathname).toBe('/editor');
    expect([...destination.searchParams]).toEqual([['sessionId', 's1'], ['versionId', 'v1'], ['q', 'A & B'], ['tag', 'one'], ['tag', 'two']]);
    expect(loginHref('/login/mfa')).toBe('/login');
  });
});
