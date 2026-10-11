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

  it('counts invalid credentials as anonymous and returns Retry-After', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 401 }));
    const headers = { 'x-atlas-edge-check': '1', 'x-atlas-client-ip': '198.51.100.96', authorization: 'Bearer invalid' };
    for (let i = 0; i < 120; i++) expect((await GET(request(headers))).status).toBe(204);
    const response = await GET(request(headers));
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBeTruthy();
    expect((await response.json()).code).toBe('anonymous_rate_limit');
  });
});
