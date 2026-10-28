import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestAnonymousBrowsingPolicy } from './lib/anonymous-browsing-policy';
import { setupStatus } from './lib/deployment-setup';
import { fetchWithTimeout } from './lib/fetch-with-timeout';
import { proxy } from './proxy';

vi.mock('./lib/anonymous-browsing-policy', () => ({ requestAnonymousBrowsingPolicy: vi.fn() }));
vi.mock('./lib/deployment-setup', async original => ({
  ...await original<typeof import('./lib/deployment-setup')>(), setupStatus: vi.fn(),
}));
vi.mock('./lib/fetch-with-timeout', () => ({ fetchWithTimeout: vi.fn() }));

function request(path: string, headers?: Record<string, string>) {
  return new NextRequest(`https://atlas.example${path}`, { headers });
}

describe('Next request proxy security and routing', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(setupStatus).mockResolvedValue({ completed: true } as Awaited<ReturnType<typeof setupStatus>>);
    vi.mocked(requestAnonymousBrowsingPolicy).mockResolvedValue({ allowed: true });
  });

  it('fails closed when deployment setup cannot be verified', async () => {
    vi.mocked(setupStatus).mockRejectedValue(new Error('unavailable'));
    const response = await proxy(request('/countries/DE'));
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(requestAnonymousBrowsingPolicy).not.toHaveBeenCalled();
  });

  it('requires setup before a public reader or its legacy redirect can run', async () => {
    vi.mocked(setupStatus).mockResolvedValue({ completed: false } as Awaited<ReturnType<typeof setupStatus>>);
    const response = await proxy(request('/countries/DE/constitution-timeline'));
    expect(response.headers.get('location')).toBe('https://atlas.example/login');
  });

  it('preserves anonymous browsing restrictions on legacy history links', async () => {
    vi.mocked(requestAnonymousBrowsingPolicy).mockResolvedValue({ allowed: false });
    const response = await proxy(request('/countries/DE/constitution-timeline'));
    expect(response.headers.get('location')).toBe('https://atlas.example/');
  });

  it('redirects authenticated legacy links only after the identity check', async () => {
    vi.mocked(requestAnonymousBrowsingPolicy).mockResolvedValue({ allowed: false });
    vi.mocked(fetchWithTimeout).mockResolvedValue(new Response('{}', { status: 200 }));
    const response = await proxy(request('/countries/DE/constitution-timeline?on=1949-05-23', { cookie: 'ca_session=reader-token' }));
    expect(fetchWithTimeout).toHaveBeenCalledWith(expect.stringMatching(/\/me$/), expect.objectContaining({
      headers: { Authorization: 'Bearer reader-token' }, cache: 'no-store',
    }));
    expect(response.headers.get('location')).toBe('https://atlas.example/countries/DE/timeline?on=1949-05-23');
  });

  it('forwards a fresh nonce and discards a spoofed history route header', async () => {
    const response = await proxy(request('/about', { 'x-history-route': '/admin', 'x-nonce': 'spoofed' }));
    const nonce = response.headers.get('x-middleware-request-x-nonce');
    expect(nonce).toBeTruthy();
    expect(nonce).not.toBe('spoofed');
    expect(response.headers.get('x-middleware-request-x-history-route')).toBeNull();
    expect(response.headers.get('content-security-policy')).toContain(`'nonce-${nonce}'`);
    expect(response.headers.get('x-middleware-request-content-security-policy')).toBe(response.headers.get('content-security-policy'));
  });

  it('derives the history route from the request URL for server rendering', async () => {
    const response = await proxy(request('/countries/DE/timeline?events=amendments', { 'x-history-route': '/admin' }));
    expect(response.headers.get('x-middleware-request-x-history-route')).toBe('/countries/DE/timeline?events=amendments');
  });
});
