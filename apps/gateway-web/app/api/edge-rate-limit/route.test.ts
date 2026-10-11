import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

const request = (headers: Record<string, string>) => new NextRequest('http://localhost/api/edge-rate-limit', { headers });

describe('edge API authorization', () => {
  beforeEach(() => vi.restoreAllMocks());

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
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 401 }));
    const headers = { 'x-atlas-edge-check': '1', 'x-atlas-client-ip': '198.51.100.96', authorization: 'Bearer invalid' };
    for (let i = 0; i < 600; i++) expect((await GET(request(headers))).status).toBe(204);
    const response = await GET(request(headers));
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBeTruthy();
    expect((await response.json()).code).toBe('anonymous_rate_limit');
  });

  it('shows a compact sign-in and retry message for browser API navigation', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(2_000);
    const headers = { 'x-atlas-edge-check': '1', 'x-atlas-client-ip': '198.51.100.98', accept: 'text/html' };
    for (let i = 0; i < 600; i++) await GET(request(headers));
    const response = await GET(request(headers));
    expect(response.status).toBe(429);
    expect(response.headers.get('content-type')).toContain('text/html');
    const body = await response.text();
    expect(body).toContain('Public pages remain available');
    expect(body).toContain('href="/login"');
  });

  it('ignores client-controlled forwarded IP headers', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(3_000);
    const edgeIp = '198.51.100.99';
    for (let i = 0; i < 600; i++) {
      const response = await GET(request({ 'x-atlas-edge-check': '1', 'x-atlas-client-ip': edgeIp, 'x-forwarded-for': `203.0.113.${i % 255}` }));
      expect(response.status).toBe(204);
    }
    const response = await GET(request({ 'x-atlas-edge-check': '1', 'x-atlas-client-ip': edgeIp, 'x-forwarded-for': '203.0.113.250' }));
    expect(response.status).toBe(429);
  });
});
