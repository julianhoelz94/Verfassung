import type { NextRequest } from 'next/server';

export function hasTrustedOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    const originUrl = new URL(origin);
    const host = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ?? request.headers.get('host');
    const protocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ?? request.nextUrl.protocol.replace(':', '');
    return Boolean(host) && originUrl.host === host && originUrl.protocol === `${protocol}:`;
  } catch {
    return false;
  }
}
