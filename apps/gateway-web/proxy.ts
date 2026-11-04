import { fetchWithTimeout } from './lib/fetch-with-timeout';
import { NextResponse, type NextRequest } from 'next/server';
import { requestAnonymousBrowsingPolicy } from './lib/anonymous-browsing-policy';
import { setupStatus, setupPathAllowed } from './lib/deployment-setup';
import { identityBaseUrl } from './lib/identity-client';

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path !== '/api/setup-gate' && path !== '/api/edge-rate-limit') {
    const admission = await setupAdmission(request, path);
    if (admission) return admission;
  }

  if (requiresBrowsingAdmission(path)) {
    const admission = await browsingAdmission(request, path);
    if (admission) return admission;
  }
  // An HTTP redirect preserves fragments on saved constitution-history URLs.
  // Keep this after the setup and anonymous-access gates.
  if (/^\/countries\/[^/]+\/constitution-timeline$/.test(path)) {
    const destination = request.nextUrl.clone();
    destination.pathname = path.replace(/constitution-timeline$/, 'timeline');
    return NextResponse.redirect(destination);
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
  requestHeaders.delete('x-history-route');
  if (/^\/countries\/[^/]+\/timeline$/.test(path)) {
    requestHeaders.set('x-history-route', request.nextUrl.pathname + request.nextUrl.search);
  }
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

/** Keep deployment admission before browsing, legacy redirects and nonce generation. */
async function setupAdmission(request: NextRequest, path: string): Promise<NextResponse | null> {
  let setup;
  try { setup = await setupStatus(); } catch {
    return new NextResponse('Setup status is temporarily unavailable. / Der Einrichtungsstatus ist vorübergehend nicht verfügbar.', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  if (setup.completed) return null;
  const admin = await isSetupAdministrator(request);
  if (!setupPathAllowed(path, admin) || (path === '/login' && admin)) {
    if (path.startsWith('/api/')) return NextResponse.json({ code: 'setup_required' }, { status: 403 });
    return NextResponse.redirect(new URL(admin ? '/setup' : '/login', request.url));
  }
  return null;
}

/** Setup requires an actual administrator role; malformed or unavailable identity data fails closed. */
async function isSetupAdministrator(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get('ca_session')?.value;
  if (!token) return false;
  try {
    const me = await fetchWithTimeout(`${identityBaseUrl()}/me`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(2000) });
    if (me.ok) return ((await me.json()) as { roles: string[] }).roles.includes('admin');
  } catch { /* Fail closed. */ }
  return false;
}

/** These existing public surfaces share the anonymous browsing policy, including reader APIs. */
function requiresBrowsingAdmission(path: string): boolean {
  return path.startsWith('/api/reader/') || path.startsWith('/constitutions/') || path.startsWith('/comparisons') || path === '/legacy' || path === '/search' || path === '/jurisdictions' || path.startsWith('/jurisdictions/') || path.startsWith('/countries/') || path.startsWith('/documents/') || path.startsWith('/versions/');
}

/** Unavailable policy requires a verified session; denied API reads retain their private JSON response. */
async function browsingAdmission(request: NextRequest, path: string): Promise<NextResponse | null> {
  const policy = await requestAnonymousBrowsingPolicy().catch(() => null);
  if (policy?.allowed || await hasVerifiedSession(request)) return null;
  return path.startsWith('/api/reader/')
    ? NextResponse.json({ code: 'browsing_requires_sign_in' }, { status: 403, headers: { 'Cache-Control': 'private, no-store' } })
    : NextResponse.redirect(new URL('/', request.url));
}

/** Browsing checks response status only, without requiring or parsing administrator JSON. */
async function hasVerifiedSession(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get('ca_session')?.value;
  if (!token) return false;
  try {
    const response = await fetchWithTimeout(`${identityBaseUrl()}/me`, {
      headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch { /* A failed identity check cannot open browsing. */ }
  return false;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
