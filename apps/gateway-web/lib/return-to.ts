const RETURN_ORIGIN = 'http://atlas.local';

function unsafePath(value: string): boolean {
  return !value.startsWith('/') || value.startsWith('//') || value.includes('\\') ||
    Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}

function returnUrl(raw: string): URL | null {
  if (raw.length > 4096 || unsafePath(raw)) return null;
  try {
    const url = new URL(raw, RETURN_ORIGIN);
    // Check the normalized pathname as dot segments can reveal a leading //.
    const decodedPath = decodeURIComponent(url.pathname);
    if (url.origin !== RETURN_ORIGIN || url.username || url.password || unsafePath(url.pathname) ||
      unsafePath(decodedPath) || /%[0-9a-f]{2}/i.test(decodedPath) ||
      unsafePath(new URL(decodedPath, RETURN_ORIGIN).pathname)) return null;
    return url;
  } catch {
    return null;
  }
}

/** Accept only unambiguous same-site paths, retaining query strings and anchors. */
export function safeReturnTo(raw: string, fallback = '/'): string {
  const url = returnUrl(raw);
  return url ? `${url.pathname}${url.search}${url.hash}` : fallback;
}

/** Login must not return to an authentication route and immediately start again. */
export function safeLoginReturnTo(raw: unknown, fallback = ''): string {
  const url = typeof raw === 'string' ? returnUrl(raw) : null;
  if (!url) return fallback;
  const pathname = new URL(decodeURIComponent(url.pathname), RETURN_ORIGIN).pathname;
  if (/^\/(?:login|logout)(?:\/|$)/i.test(pathname)) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}

export type ReturnSearchParams = Record<string, string | string[] | undefined>;

/** Carry the intended page through password, MFA, and passkey sign-in. */
export function loginHref(path: string, searchParams?: ReturnSearchParams): string {
  const next = safeLoginReturnTo(path);
  if (!next) return '/login';
  const url = new URL(next, RETURN_ORIGIN);
  for (const [name, value] of Object.entries(searchParams ?? {})) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      url.searchParams.append(name, item);
    }
  }
  const destination = safeLoginReturnTo(`${url.pathname}${url.search}${url.hash}`);
  return destination ? `/login?next=${encodeURIComponent(destination)}` : '/login';
}
