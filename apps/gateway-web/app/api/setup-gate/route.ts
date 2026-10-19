import { NextRequest, NextResponse } from 'next/server';
import { setupPathAllowed, setupStatus } from '../../../lib/deployment-setup';
import { identityBaseUrl } from '../../../lib/identity-client';

export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  if (request.headers.get('x-atlas-edge-check') !== '1') return new NextResponse(null, { status: 403 });
  try {
    const state = await setupStatus();
    if (state.completed) return new NextResponse(null, { status: 204 });
    const path = request.headers.get('x-atlas-original-uri') ?? '';
    const token = request.cookies.get('ca_session')?.value;
    let admin = false;
    if (token) {
      const me = await fetch(`${identityBaseUrl()}/me`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(2000) });
      if (me.ok) admin = ((await me.json()) as { roles: string[] }).roles.includes('admin');
    }
    // API callers use bearer sessions; cookies are only a browser convenience.
    if (!admin && request.headers.get('authorization')) {
      const me = await fetch(`${identityBaseUrl()}/me`, { headers: { Authorization: request.headers.get('authorization')! }, cache: 'no-store', signal: AbortSignal.timeout(2000) });
      if (me.ok) admin = ((await me.json()) as { roles: string[] }).roles.includes('admin');
    }
    if (setupPathAllowed(path, admin)) return new NextResponse(null, { status: 204 });
    if (!/^\/(api|oauth|mcp)(\/|$)/.test(path)) return new NextResponse(null, { status: 303, headers: { Location: admin ? '/setup' : '/login', 'Cache-Control': 'no-store' } });
    return NextResponse.json({ code: 'setup_required' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ code: 'setup_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
