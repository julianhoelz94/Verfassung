import { fetchWithTimeout } from '../../../lib/fetch-with-timeout';
import { NextRequest, NextResponse } from 'next/server';
import { anonymousApiLimit } from '../../../lib/anonymous-api-limit';
import { requestAnonymousBrowsingPolicy } from '../../../lib/anonymous-browsing-policy';
import { identityBaseUrl } from '../../../lib/identity-client';
import { setupStatus, setupPathAllowed } from '../../../lib/deployment-setup';
import { SESSION_COOKIE } from '../../../lib/session';
import { requestSwaggerAccessPolicy } from '../../../lib/swagger-access';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Caddy sets this header only for its internal forward_auth request.
  if (request.headers.get('x-atlas-edge-check') !== '1') return new NextResponse(null, { status: 403 });
  const path = (request.headers.get('x-atlas-original-uri') ?? '').split('?')[0];
  const method = request.headers.get('x-atlas-original-method');
  // Swagger's interactive API aliases have the same policy as their canonical routes.
  const originalUri = path.replace(/^\/api\/docs\//, '/api/');
  // Spring decodes paths and ignores matrix parameters when matching routes.
  // Include canonical API paths so they cannot bypass the documentation setting.
  let documentationPath: string;
  try {
    const decoded = decodeURIComponent(path).replace(/\\/g, '/').split('/')
      .map((segment) => segment.split(';')[0]).join('/').replace(/\/{2,}/g, '/');
    const normalized = new URL('http://internal');
    normalized.pathname = decoded;
    documentationPath = normalized.pathname;
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const documentationRequest = documentationPath.startsWith('/api/docs/') ||
    /^\/api\/(catalog|content|amendment|identity|editor|search|ingestion|audit|document)\/(swagger-ui(?:\.html)?|v3\/api-docs(?:\.yaml)?)(?:\/|$)/.test(documentationPath);
  if (documentationRequest) {
    try {
      if (!(await requestSwaggerAccessPolicy()).enabled) return new NextResponse(null, { status: 404 });
    } catch {
      return NextResponse.json({ code: 'swagger_policy_unavailable' }, { status: 503 });
    }
  }
  try {
    const { completed } = await setupStatus();
    if (!completed && setupPathAllowed(originalUri, false)) return new NextResponse(null, { status: 204 });
    // Public documentation does not grant anonymous access to "Try it out" API calls.
    if (completed && (method === 'GET' || method === 'HEAD') && !path.includes('..') &&
        /^\/api\/(?:docs\/)?(catalog|content|amendment|identity|editor|search|ingestion|audit|document)\/(swagger-ui(?:\.html|\/[\w.-]*)|v3\/api-docs(?:\.yaml|\/swagger-config)?)$/.test(path)) {
      return new NextResponse(null, { status: 204 });
    }
  } catch { return NextResponse.json({ code: 'setup_unavailable' }, { status: 503 }); }
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const credential = token ? `Bearer ${token}` : request.headers.get('authorization');
  if (credential) {
    try {
      const response = await fetchWithTimeout(`${identityBaseUrl()}/me`, {
        headers: { Authorization: credential },
        cache: 'no-store',
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) return new NextResponse(null, { status: 204 });
    } catch {
      // Failed validation receives the anonymous quota, never an auth bypass.
    }
  }
  let policy;
  try {
    policy = await requestAnonymousBrowsingPolicy();
  } catch {
    return NextResponse.json({ code: 'anonymous_policy_unavailable', detail: 'Browsing settings are temporarily unavailable.' }, { status: 503 });
  }
  if (!policy.allowed) {
    if (originalUri.startsWith('/api/identity') || originalUri.startsWith('/oauth/')) {
      return new NextResponse(null, { status: 204 });
    }
    return NextResponse.json(
      { code: 'anonymous_browsing_disabled', detail: 'Sign in to browse constitutions.' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const ip = request.headers.get('x-atlas-client-ip') || 'unknown';
  const retryAfter = anonymousApiLimit(ip, policy);
  if (retryAfter !== null) {
    const headers = { 'Retry-After': String(retryAfter), 'Cache-Control': 'no-store' };
    if (request.headers.get('accept')?.includes('text/html')) {
      return new NextResponse(
        `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Too many requests</title><main style="max-width:36rem;margin:3rem auto;padding:1rem;font:1rem system-ui"><h1>Too many requests</h1><p>Anonymous API access is temporarily limited. Try again in ${retryAfter} seconds.</p><p>Public pages remain available. <a href="/">Browse constitutions</a> or <a href="/login">sign in</a> for unrestricted API access.</p></main></html>`,
        { status: 429, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } },
      );
    }
    return NextResponse.json(
      { code: 'anonymous_rate_limit', detail: 'Too many anonymous API requests. Sign in or retry later.' },
      { status: 429, headers },
    );
  }
  return new NextResponse(null, { status: 204 });
}
