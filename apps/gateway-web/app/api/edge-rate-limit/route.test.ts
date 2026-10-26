vi.mock('../../../lib/deployment-setup', async (original) => ({ ...await original<typeof import('../../../lib/deployment-setup')>(), setupStatus: async () => ({ completed: true, tlsMode: 'local-http', publicUrl: 'http://localhost' }) }));
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

const request = (headers: Record<string, string>) => new NextRequest('http://localhost/api/edge-rate-limit', { headers });

describe('edge API authorization', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      String(input).endsWith('/anonymous-browsing')
        ? new Response(JSON.stringify({ allowed: true, perIp: { requests: 3, windowValue: 1, windowUnit: 'minutes' }, total: { requests: 30, windowValue: 1, windowUnit: 'minutes' } }), { status: 200 })
        : new Response(null, { status: 401 }),
    );
  });

  it('rejects requests without the internal Caddy marker', async () => {
    expect((await GET(request({ 'x-atlas-client-ip': '198.51.100.94' }))).status).toBe(403);
  });

  it('exempts an Identity-validated account session', async () => {
    const check = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const response = await GET(request({ 'x-atlas-edge-check': '1', 'x-atlas-client-ip': '198.51.100.95', cookie: 'ca_session=valid' }));
    expect(response.status).toBe(204);
    expect(check).toHaveBeenCalledWith(expect.stringContaining('/me'), expect.objectContaining({ headers: { Authorization: 'Bearer valid' } }));
  });

  it('exempts a validated bearer credential used by an API client', async () => {
    const check = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const response = await GET(request({ 'x-atlas-edge-check': '1', 'x-atlas-client-ip': '198.51.100.97', authorization: 'Bearer account-key' }));
    expect(response.status).toBe(204);
    expect(check).toHaveBeenCalledWith(expect.stringContaining('/me'), expect.objectContaining({ headers: { Authorization: 'Bearer account-key' } }));
  });

  it('counts invalid credentials as anonymous and returns Retry-After', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const headers = { 'x-atlas-edge-check': '1', 'x-atlas-client-ip': '198.51.100.96', authorization: 'Bearer invalid' };
    for (let i = 0; i < 3; i++) expect((await GET(request(headers))).status).toBe(204);
    const response = await GET(request(headers));
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBeTruthy();
    expect((await response.json()).code).toBe('anonymous_rate_limit');
  });

  it('shows a compact sign-in and retry message for browser API navigation', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(2_000);
    const headers = { 'x-atlas-edge-check': '1', 'x-atlas-client-ip': '198.51.100.98', accept: 'text/html' };
    for (let i = 0; i < 3; i++) await GET(request(headers));
    const response = await GET(request(headers));
    expect(response.status).toBe(429);
    expect(response.headers.get('content-type')).toContain('text/html');
    const body = await response.text();
    expect(body).toContain('Public pages remain available');
    expect(body).toContain('href="/login"');
  });

  it('blocks disabled anonymous browsing without a rate-limit retry message', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      String(input).endsWith('/anonymous-browsing')
        ? new Response(JSON.stringify({ allowed: false, perIp: { requests: 0, windowValue: 1, windowUnit: 'minutes' }, total: { requests: 0, windowValue: 1, windowUnit: 'minutes' } }), { status: 200 })
        : new Response(null, { status: 401 }),
    );
    for (const prefix of ['/api', '/api/docs']) {
      const response = await GET(request({ 'x-atlas-edge-check': '1', 'x-atlas-client-ip': '198.51.100.100', 'x-atlas-original-uri': `${prefix}/catalog/countries` }));
      expect(response.status).toBe(403);
      expect(response.headers.get('Retry-After')).toBeNull();
      expect((await response.json()).code).toBe('anonymous_browsing_disabled');
      expect((await GET(request({ 'x-atlas-edge-check': '1', 'x-atlas-original-uri': `${prefix}/identity/login` }))).status).toBe(204);
    }
  });

  it('counts Swagger API aliases against the same anonymous visitor budget', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(4_000);
    for (const path of ['/api/catalog/countries', '/api/docs/catalog/countries', '/api/docs/content/versions']) {
      expect((await GET(request({ 'x-atlas-edge-check': '1', 'x-atlas-client-ip': '198.51.100.101', 'x-atlas-original-uri': path }))).status).toBe(204);
    }
    for (const prefix of ['/api', '/api/docs']) {
      expect((await GET(request({ 'x-atlas-edge-check': '1', 'x-atlas-client-ip': '198.51.100.101', 'x-atlas-original-uri': `${prefix}/catalog/countries` }))).status).toBe(429);
    }
  });

  it('ignores client-controlled forwarded IP headers', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(3_000);
    const edgeIp = '198.51.100.99';
    for (let i = 0; i < 3; i++) {
      const response = await GET(request({ 'x-atlas-edge-check': '1', 'x-atlas-client-ip': edgeIp, 'x-forwarded-for': `203.0.113.${i % 255}` }));
      expect(response.status).toBe(204);
    }
    const response = await GET(request({ 'x-atlas-edge-check': '1', 'x-atlas-client-ip': edgeIp, 'x-forwarded-for': '203.0.113.250' }));
    expect(response.status).toBe(429);
  });
});
