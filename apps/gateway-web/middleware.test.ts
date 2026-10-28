// @vitest-environment node
// EDGE-1: setup admission, anonymous browsing, trusted history context and CSP.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { setupStatus } from './lib/deployment-setup';
import { requestAnonymousBrowsingPolicy } from './lib/anonymous-browsing-policy';
import { middleware } from './middleware';
import { json } from './test/server-boundary';
vi.mock('./lib/deployment-setup', async original => ({ ...await original<typeof import('./lib/deployment-setup')>(), setupStatus: vi.fn() }));
vi.mock('./lib/anonymous-browsing-policy', () => ({ requestAnonymousBrowsingPolicy: vi.fn() }));
const request = (path: string, token?: string) => new NextRequest(`https://atlas.example${path}`, { headers: { ...(token ? { cookie: `ca_session=${token}` } : {}), 'x-history-route': '/forged-route' } });
beforeEach(() => {
  vi.mocked(setupStatus).mockResolvedValue({ completed: true, publicUrl: 'https://atlas.example', tlsMode: 'proxy' });
  vi.mocked(requestAnonymousBrowsingPolicy).mockResolvedValue({ allowed: true, serverDefault: true, override: null });
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json({ roles: ['admin'] }));
});
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllEnvs(); });

describe('deployment and browsing admission', () => {
  it('fails closed and disables caching when setup status is unavailable', async () => {
    vi.mocked(setupStatus).mockRejectedValue(new Error('offline')); const result = await middleware(request('/countries/XA'));
    expect(result.status).toBe(503); expect(result.headers.get('cache-control')).toBe('no-store'); expect(result.headers.has('location')).toBe(false);
  });
  it.each(['/api/setup-gate', '/api/edge-rate-limit'])('does not recursively gate internal admission route %s', async path => {
    vi.mocked(setupStatus).mockRejectedValue(new Error('offline')); expect((await middleware(request(path))).status).toBe(200); expect(setupStatus).not.toHaveBeenCalled();
  });
  it('redirects anonymous page access to login until setup is complete', async () => {
    vi.mocked(setupStatus).mockResolvedValue({ completed: false, publicUrl: '', tlsMode: 'proxy' });
    expect((await middleware(request('/countries/XA'))).headers.get('location')).toBe('https://atlas.example/login');
    expect((await middleware(request('/login'))).status).toBe(200);
  });
  it('rejects API access with a structured setup-required response', async () => {
    vi.mocked(setupStatus).mockResolvedValue({ completed: false, publicUrl: '', tlsMode: 'proxy' });
    const result = await middleware(request('/api/content/versions')); expect(result.status).toBe(403); expect(await result.json()).toEqual({ code: 'setup_required' });
  });
  it('directs administrators to setup, while an ordinary or invalid session cannot open it', async () => {
    vi.mocked(setupStatus).mockResolvedValue({ completed: false, publicUrl: '', tlsMode: 'proxy' });
    expect((await middleware(request('/login', 'admin-session'))).headers.get('location')).toBe('https://atlas.example/setup');
    expect((await middleware(request('/setup', 'admin-session'))).status).toBe(200);
    vi.mocked(fetch).mockResolvedValue(json({ roles: ['viewer'] }));
    expect((await middleware(request('/setup', 'viewer-session'))).headers.get('location')).toBe('https://atlas.example/login');
    vi.mocked(fetch).mockRejectedValue(new Error('offline'));
    expect((await middleware(request('/setup', 'unverified-session'))).headers.get('location')).toBe('https://atlas.example/login');
  });
  it.each(['/countries/XA', '/constitutions/charter', '/comparisons', '/legacy', '/search?q=rights', '/jurisdictions/XA', '/documents/source', '/versions/snapshot'])('requires verified sign-in when public browsing is disabled: %s', async path => {
    vi.mocked(requestAnonymousBrowsingPolicy).mockResolvedValue({ allowed: false, serverDefault: false, override: null });
    expect((await middleware(request(path))).headers.get('location')).toBe('https://atlas.example/');
    expect((await middleware(request(path, 'verified-session'))).status).toBe(200);
    expect(new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer verified-session');
  });
  it('treats policy and session lookup failures as closed browsing', async () => {
    vi.mocked(requestAnonymousBrowsingPolicy).mockRejectedValue(new Error('offline')); vi.mocked(fetch).mockResolvedValue(json({}, 401));
    expect((await middleware(request('/countries/XA', 'revoked-session'))).headers.get('location')).toBe('https://atlas.example/');
    vi.mocked(fetch).mockRejectedValue(new Error('offline'));
    expect((await middleware(request('/countries/XA', 'unknown-session'))).headers.get('location')).toBe('https://atlas.example/');
  });
  it('preserves query on legacy history redirects after checking access', async () => {
    expect((await middleware(request('/countries/XA/constitution-timeline?at=1949'))).headers.get('location')).toBe('https://atlas.example/countries/XA/timeline?at=1949');
    vi.mocked(requestAnonymousBrowsingPolicy).mockResolvedValue({ allowed: false, serverDefault: false, override: null });
    expect((await middleware(request('/countries/XA/constitution-timeline?at=1949'))).headers.get('location')).toBe('https://atlas.example/');
  });
});

describe('security headers and trusted request context', () => {
  it('replaces a forged nonce and carries the same CSP into rendering and the response', async () => {
    const result = await middleware(request('/countries/XA'));
    const csp = result.headers.get('content-security-policy')!;
    const nonce = result.headers.get('x-middleware-request-x-nonce')!;
    expect(nonce).toBeTruthy(); expect(csp).toContain(`'nonce-${nonce}'`); expect(csp).toContain("object-src 'none'"); expect(csp).toContain("frame-ancestors 'none'");
    expect(result.headers.get('x-middleware-request-content-security-policy')).toBe(csp); expect(result.headers.has('x-middleware-request-x-history-route')).toBe(false);
  });
  it('supplies a trusted history route only for the actual timeline', async () => {
    const result = await middleware(request('/countries/XA/timeline?constitutionId=charter'));
    expect(result.headers.get('x-middleware-request-x-history-route')).toBe('/countries/XA/timeline?constitutionId=charter');
  });
  it.each([['production', false], ['development', true]] as const)('allows development evaluation only in %s: %s', async (environment, evalAllowed) => {
    vi.stubEnv('NODE_ENV', environment); const csp = (await middleware(request('/'))).headers.get('content-security-policy')!;
    expect(csp.includes("'unsafe-eval'")).toBe(evalAllowed);
  });
});
