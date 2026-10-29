vi.mock('../../../lib/deployment-setup', async (original) => ({ ...await original<typeof import('../../../lib/deployment-setup')>(), setupStatus: vi.fn() }));
vi.mock('../../../lib/swagger-access', () => ({ requestSwaggerAccessPolicy: vi.fn() }));
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { setupStatus } from '../../../lib/deployment-setup';
import { requestSwaggerAccessPolicy } from '../../../lib/swagger-access';

const request = (headers: Record<string, string>) => new NextRequest('http://localhost/api/edge-rate-limit', { headers });

describe('edge API authorization', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(setupStatus).mockResolvedValue({ completed: true, tlsMode: 'local-http', publicUrl: 'http://localhost' });
    vi.mocked(requestSwaggerAccessPolicy).mockResolvedValue({ enabled: true });
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

  it('serves Swagger documents and assets without sign-in even when browsing is disabled', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ allowed: false }), { status: 200 }));
    for (const service of ['catalog', 'content', 'amendment', 'identity', 'editor', 'search', 'ingestion', 'audit', 'document']) {
      for (const suffix of ['swagger-ui.html', 'swagger-ui/', 'swagger-ui/index.html', 'swagger-ui/swagger-ui.css', 'swagger-ui/swagger-initializer.js', 'v3/api-docs', 'v3/api-docs.yaml', 'v3/api-docs/swagger-config?x=1']) {
        for (const method of ['GET', 'HEAD']) {
          const response = await GET(request({ 'x-atlas-edge-check': '1', 'x-atlas-original-method': method, 'x-atlas-original-uri': `/api/docs/${service}/${suffix}` }));
          expect(response.status).toBe(204);
        }
      }
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not exempt API calls, writes, or ambiguous Swagger paths', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ allowed: false }), { status: 200 }));
    for (const path of ['countries', 'swagger-ui/../countries', 'swagger-ui/%2e%2e/countries', 'v3/api-docs/../../countries', 'v3/api-docs-extra', 'swagger-ui-extra']) {
      expect((await GET(request({ 'x-atlas-edge-check': '1', 'x-atlas-original-method': 'GET', 'x-atlas-original-uri': `/api/docs/catalog/${path}` }))).status).toBe(403);
    }
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', '']) {
      expect((await GET(request({ 'x-atlas-edge-check': '1', 'x-atlas-original-method': method, 'x-atlas-original-uri': '/api/docs/catalog/v3/api-docs' }))).status).toBe(403);
    }
  });

  it('does not grant public Swagger access during setup', async () => {
    vi.mocked(setupStatus).mockResolvedValue({ completed: false, tlsMode: 'local-http', publicUrl: 'http://localhost' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ allowed: false }), { status: 200 }));
    expect((await GET(request({ 'x-atlas-edge-check': '1', 'x-atlas-original-method': 'GET', 'x-atlas-original-uri': '/api/docs/catalog/swagger-ui/index.html' }))).status).toBe(403);
  });

  it('blocks all Swagger routes when disabled, including authenticated requests', async () => {
    vi.mocked(requestSwaggerAccessPolicy).mockResolvedValue({ enabled: false });
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    for (const path of ['swagger-ui/index.html', 'v3/api-docs', 'countries']) {
      for (const credentials of [{}, { cookie: 'ca_session=admin' }, { authorization: 'Bearer admin-key' }]) {
        const response = await GET(request({ ...credentials, 'x-atlas-edge-check': '1', 'x-atlas-original-method': 'GET', 'x-atlas-original-uri': `/api/docs/catalog/${path}` }));
        expect(response.status).toBe(404);
      }
    }
    expect(fetch).not.toHaveBeenCalled();
    expect((await GET(request({ 'x-atlas-edge-check': '1', 'x-atlas-original-uri': '/api/catalog/countries', authorization: 'Bearer admin-key' }))).status).toBe(204);
  });

  it('fails closed when the Swagger setting cannot be read', async () => {
    vi.mocked(requestSwaggerAccessPolicy).mockRejectedValue(new Error('unavailable'));
    const response = await GET(request({ 'x-atlas-edge-check': '1', 'x-atlas-original-method': 'GET', 'x-atlas-original-uri': '/api/docs/catalog/swagger-ui/index.html', authorization: 'Bearer admin-key' }));
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe('swagger_policy_unavailable');
  });

  it('also blocks canonical Swagger URLs and Spring path aliases when disabled', async () => {
    vi.mocked(requestSwaggerAccessPolicy).mockResolvedValue({ enabled: false });
    for (const path of ['swagger-ui.html', 'swagger-ui/index.html', 'v3/api-docs', 'v3/api-docs.yaml', 'v3/api-docs/group', '%73wagger-ui/index.html', 'swagger-ui;v=1/index.html', 'v3/api-docs;v=1', 'other/../swagger-ui/index.html', '/swagger-ui/index.html', '%23/../swagger-ui/index.html', '%3f/../swagger-ui/index.html', 'other//../swagger-ui/index.html']) {
      const response = await GET(request({ 'x-atlas-edge-check': '1', 'x-atlas-original-method': 'GET', 'x-atlas-original-uri': `/api/catalog/${path}`, cookie: 'ca_session=admin' }));
      expect(response.status).toBe(404);
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
