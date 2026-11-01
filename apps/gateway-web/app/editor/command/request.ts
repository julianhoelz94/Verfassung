import { NextRequest, NextResponse } from 'next/server';

/** Parsed native-command inputs; source revision parsing happens before command error translation. */
export type CommandContext = {
  request: NextRequest;
  form: FormData;
  command: string;
  sessionId: string;
  sourceEvidenceRevision: number | undefined;
};

/** Native forms historically trim every scalar, including String conversions of non-text fields. */
export function value(form: FormData, key: string): string {
  return String(form.get(key) ?? '').trim();
}

/** Query commands take precedence even when empty; optional revision zero is a valid pin. */
export function commandContext(request: NextRequest, form: FormData): CommandContext {
  const command = request.nextUrl.searchParams.get('command') ?? value(form, 'command');
  const sessionId = value(form, 'sessionId');
  const revision = value(form, 'sourceEvidenceRevision');
  const sourceEvidenceRevision = revision && /^\d+$/.test(revision) && Number.isSafeInteger(Number(revision)) ? Number(revision) : undefined;
  return { request, form, command, sessionId, sourceEvidenceRevision };
}

/** Restores only the established editor selection keys, followed by command outcome flags. */
export function editorPath(form: FormData, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams();
  for (const key of ['versionId', 'sessionId', 'articleId', 'scope', 'selectedNode']) {
    const entry = value(form, key);
    if (entry) params.set(key, entry);
  }
  for (const [key, entry] of Object.entries(extra)) params.set(key, entry);
  return `/editor?${params.toString()}`;
}

/** Redirects preserve the trusted submitted origin, or the configured first forwarded host/protocol. */
export function redirectTo(request: NextRequest, path: string): NextResponse {
  const origin = request.headers.get('origin');
  if (origin) return NextResponse.redirect(new URL(path, origin), 303);
  const host = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ?? request.headers.get('host');
  const protocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ?? request.nextUrl.protocol.replace(':', '');
  return NextResponse.redirect(new URL(path, host ? `${protocol}://${host}` : request.url), 303);
}

/** Origin validation precedes body parsing; origin-less native requests retain their existing behavior. */
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
