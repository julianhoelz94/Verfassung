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
    if (url.username || url.password || url.host !== 'atlas.local') {
      return fallback;
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}
