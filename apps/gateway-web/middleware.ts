import { NextResponse, type NextRequest } from 'next/server';
import { requestAnonymousBrowsingPolicy } from './lib/anonymous-browsing-policy';
import { identityBaseUrl } from './lib/identity-client';

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path === '/search' || path.startsWith('/countries/') || path.startsWith('/documents/') || path.startsWith('/versions/')) {
    const policy = await requestAnonymousBrowsingPolicy().catch(() => null);
    if (!policy?.allowed) {
      const token = request.cookies.get('ca_session')?.value;
      let authenticated = false;
      if (token) {
        try {
          const response = await fetch(`${identityBaseUrl()}/me`, {
            headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(2000),
          });
          authenticated = response.ok;
        } catch { /* A failed identity check cannot open browsing. */ }
      }
      if (!authenticated) return NextResponse.redirect(new URL('/', request.url));
    }
  }
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isDev = process.env.NODE_ENV === 'development';
  // Next.js inline runtime scripts take the nonce. Styles still need 'unsafe-inline'
  // until the App Router emits style nonces (SEC-2). Swagger is not served by Next.
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
