/**
 * Accept only same-site, path-absolute `returnTo` values for post-action redirects.
 *
 * Rejects protocol-relative (`//evil`), backslash (`/\evil`, normalised to `//` by
 * some browsers), credential, and host-bearing inputs. Returns `fallback` otherwise.
 */
export function safeReturnTo(raw: string, fallback = '/'): string {
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) {
    return fallback;
  }
  try {
    const url = new URL(raw, 'http://atlas.local');
    // Dot segments (including encoded ones) can normalize a path into `//host`.
    // Re-check the value we return because redirect() interprets that as a host.
    if (url.username || url.password || url.host !== 'atlas.local' || url.pathname.startsWith('//')) {
      return fallback;
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}
