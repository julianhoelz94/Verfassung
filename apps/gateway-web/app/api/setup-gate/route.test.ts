// EDGE-1: incomplete setup fails closed for APIs and redirects browsers explicitly.
// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupStatus } from '../../../lib/deployment-setup';
import { json } from '../../../test/server-boundary';
import { GET } from './route';
vi.mock('../../../lib/deployment-setup', async original => ({ ...await original<typeof import('../../../lib/deployment-setup')>(), setupStatus: vi.fn() }));
const request = (path: string, headers: Record<string, string> = {}) => new NextRequest('https://atlas.example/api/setup-gate', { headers: { 'x-atlas-edge-check': '1', 'x-atlas-original-uri': path, ...headers } });
beforeEach(() => { vi.mocked(setupStatus).mockResolvedValue({ completed: false, tlsMode: 'proxy', publicUrl: 'https://atlas.example' }); vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json({ roles: ['admin'] })); });
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });
describe('edge setup admission', () => {
  it('rejects requests without the internal admission marker', async () => {
    expect((await GET(new NextRequest('https://atlas.example/api/setup-gate'))).status).toBe(403); expect(setupStatus).not.toHaveBeenCalled();
  });
  it('allows the completed deployment without inspecting browser credentials', async () => {
    vi.mocked(setupStatus).mockResolvedValue({ completed: true, tlsMode: 'proxy', publicUrl: 'https://atlas.example' }); expect((await GET(request('/api/catalog/countries'))).status).toBe(204); expect(fetch).not.toHaveBeenCalled();
  });
  it('directs a browser to login, and a verified administrator to setup', async () => {
    const anonymous = await GET(request('/countries/XA')); expect(anonymous.status).toBe(303); expect(anonymous.headers.get('location')).toBe('/login'); expect(anonymous.headers.get('cache-control')).toBe('no-store');
    const admin = await GET(request('/countries/XA', { cookie: 'ca_session=admin-session' })); expect(admin.status).toBe(303); expect(admin.headers.get('location')).toBe('/setup');
  });
  it('accepts bearer authorization for administrative setup APIs', async () => {
    expect((await GET(request('/api/identity/setup', { authorization: 'Bearer admin-session' }))).status).toBe(204); expect(new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer admin-session');
  });
  it.each(['/api/catalog/countries', '/oauth/approve', '/mcp'])('rejects unconfigured public API %s with structured failure', async path => {
    const result = await GET(request(path)); expect(result.status).toBe(403); expect(await result.json()).toEqual({ code: 'setup_required' });
  });
  it('does not grant setup access to a non-administrator bearer', async () => {
    vi.mocked(fetch).mockImplementation(async () => json({ roles: ['viewer'] })); expect((await GET(request('/api/identity/setup', { authorization: 'Bearer viewer-session' }))).status).toBe(403);
  });
  it('reports dependency failure as unavailable rather than admitting traffic', async () => {
    vi.mocked(setupStatus).mockRejectedValue(new Error('offline')); const result = await GET(request('/api/catalog/countries')); expect(result.status).toBe(503); expect(await result.json()).toEqual({ code: 'setup_unavailable' });
  });
});
