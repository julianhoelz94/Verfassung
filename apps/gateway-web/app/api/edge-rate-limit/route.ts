import { NextRequest, NextResponse } from 'next/server';
import { anonymousApiLimit } from '../../../lib/anonymous-api-limit';
import { identityBaseUrl } from '../../../lib/identity-client';
import { SESSION_COOKIE } from '../../../lib/session';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Caddy sets this header only for its internal forward_auth request.
  if (request.headers.get('x-atlas-edge-check') !== '1') return new NextResponse(null, { status: 403 });
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const credential = token ? `Bearer ${token}` : request.headers.get('authorization');
  if (credential) {
    try {
      const response = await fetch(`${identityBaseUrl()}/me`, {
        headers: { Authorization: credential },
        cache: 'no-store',
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) return new NextResponse(null, { status: 204 });
    } catch {
      // Failed validation receives the anonymous quota, never an auth bypass.
    }
  }
  const ip = request.headers.get('x-atlas-client-ip') || 'unknown';
  const retryAfter = anonymousApiLimit(ip);
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
