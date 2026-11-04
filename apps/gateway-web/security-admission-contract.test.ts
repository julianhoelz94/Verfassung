import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { proxy } from './proxy';
import { GET } from './app/api/edge-rate-limit/route';
import { setupStatus } from './lib/deployment-setup';
import { requestAnonymousBrowsingPolicy } from './lib/anonymous-browsing-policy';
import { requestSwaggerAccessPolicy } from './lib/swagger-access';
import { fetchWithTimeout } from './lib/fetch-with-timeout';
import { anonymousApiLimit } from './lib/anonymous-api-limit';

vi.mock('./lib/deployment-setup', async original => ({ ...await original<typeof import('./lib/deployment-setup')>(), setupStatus: vi.fn() }));
vi.mock('./lib/anonymous-browsing-policy', () => ({ requestAnonymousBrowsingPolicy: vi.fn() }));
vi.mock('./lib/swagger-access', () => ({ requestSwaggerAccessPolicy: vi.fn() }));
vi.mock('./lib/fetch-with-timeout', () => ({ fetchWithTimeout: vi.fn() }));
vi.mock('./lib/anonymous-api-limit', () => ({ anonymousApiLimit: vi.fn() }));

const policy = { allowed: true, perIp: { requests: 3, windowValue: 1, windowUnit: 'minutes' as const }, total: { requests: 30, windowValue: 1, windowUnit: 'minutes' as const } };
const edgeRequest = (headers: Record<string, string>) => new NextRequest('https://atlas.example/api/edge-rate-limit', { headers: { 'x-atlas-edge-check': '1', ...headers } });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(setupStatus).mockResolvedValue({ completed: true, tlsMode: 'proxy', publicUrl: 'https://atlas.example' });
  vi.mocked(requestSwaggerAccessPolicy).mockResolvedValue({ enabled: true });
  vi.mocked(requestAnonymousBrowsingPolicy).mockResolvedValue(policy);
  vi.mocked(anonymousApiLimit).mockReturnValue(null);
});
afterEach(() => vi.restoreAllMocks());

describe('admission ordering contracts', () => {
  it('checks setup before browsing, then replaces spoofed timeline and nonce context', async () => {
    const calls: string[] = [];
    vi.mocked(setupStatus).mockImplementation(async () => { calls.push('setup'); return { completed: true, tlsMode: 'proxy', publicUrl: '' }; });
    vi.mocked(requestAnonymousBrowsingPolicy).mockImplementation(async () => { calls.push('browsing'); return { ...policy, allowed: false }; });
    vi.mocked(fetchWithTimeout).mockImplementation(async () => { calls.push('identity'); return new Response('not-json'); });
    const response = await proxy(new NextRequest('https://atlas.example/countries/XA/timeline?events=all', { headers: { cookie: 'ca_session=session', 'x-history-route': '/forged', 'x-nonce': 'forged' } }));
    expect(calls).toEqual(['setup', 'browsing', 'identity']);
    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-request-x-history-route')).toBe('/countries/XA/timeline?events=all');
    expect(response.headers.get('x-middleware-request-x-nonce')).not.toBe('forged');
  });

  it('fails closed on malformed administrator JSON before reading browsing policy', async () => {
    vi.mocked(setupStatus).mockResolvedValue({ completed: false, tlsMode: 'proxy', publicUrl: '' });
    vi.mocked(fetchWithTimeout).mockResolvedValue(new Response('not-json'));
    const response = await proxy(new NextRequest('https://atlas.example/setup', { headers: { cookie: 'ca_session=session' } }));
    expect(response.headers.get('location')).toBe('https://atlas.example/login');
    expect(requestAnonymousBrowsingPolicy).not.toHaveBeenCalled();
    expect(response.headers.get('content-security-policy')).toBeNull();
  });

  it.each(['%zz', '%E0%A4%A'])('rejects malformed documentation encoding before downstream reads: %s', async encoded => {
    expect((await GET(edgeRequest({ 'x-atlas-original-uri': `/api/catalog/${encoded}` }))).status).toBe(400);
    expect(requestSwaggerAccessPolicy).not.toHaveBeenCalled();
    expect(setupStatus).not.toHaveBeenCalled();
    expect(fetchWithTimeout).not.toHaveBeenCalled();
  });

  it('checks canonical documentation policy before setup or an administrator credential', async () => {
    vi.mocked(requestSwaggerAccessPolicy).mockResolvedValue({ enabled: false });
    const response = await GET(edgeRequest({ 'x-atlas-original-uri': '/api/catalog/other/../swagger-ui;v=1/index.html', cookie: 'ca_session=admin' }));
    expect(response.status).toBe(404);
    expect(setupStatus).not.toHaveBeenCalled();
    expect(fetchWithTimeout).not.toHaveBeenCalled();
  });

  it('uses a nonempty cookie before the bearer header and keeps failed identity in the quota', async () => {
    const calls: string[] = [];
    vi.mocked(setupStatus).mockImplementation(async () => { calls.push('setup'); return { completed: true, tlsMode: 'proxy', publicUrl: '' }; });
    vi.mocked(fetchWithTimeout).mockImplementation(async (_url, options) => { calls.push(`identity:${new Headers(options?.headers).get('Authorization')}`); throw new Error('offline'); });
    vi.mocked(requestAnonymousBrowsingPolicy).mockImplementation(async () => { calls.push('browsing'); return policy; });
    vi.mocked(anonymousApiLimit).mockImplementation(ip => { calls.push(`quota:${ip}`); return 12; });
    const response = await GET(edgeRequest({ cookie: 'ca_session=cookie-token', authorization: 'Bearer header-token', 'x-atlas-client-ip': '192.0.2.5', 'x-forwarded-for': '192.0.2.99' }));
    expect(calls).toEqual(['setup', 'identity:Bearer cookie-token', 'browsing', 'quota:192.0.2.5']);
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('12');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ code: 'anonymous_rate_limit', detail: 'Too many anonymous API requests. Sign in or retry later.' });
  });

  it.each(['/api/docs/identity/login', '/oauth/token'])('keeps login available without consuming disabled browsing quota: %s', async path => {
    vi.mocked(requestAnonymousBrowsingPolicy).mockResolvedValue({ ...policy, allowed: false });
    expect((await GET(edgeRequest({ 'x-atlas-original-uri': path }))).status).toBe(204);
    expect(anonymousApiLimit).not.toHaveBeenCalled();
  });
});
