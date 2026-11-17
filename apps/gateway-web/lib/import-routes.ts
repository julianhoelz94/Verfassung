/** Canonicalise legacy read links; query multiplicity and fragments remain intact. */
export function canonicalImportUrl(input: URL): URL | null {
  const url = new URL(input.href), path = url.pathname;
  if (path === '/admin/import' || /^\/admin\/import\/(?:setup|packages)\/[^/]+\/?$/.test(path)) url.pathname = path.replace('/admin/import', '/import');
  else if (path === '/admin/migrations') url.pathname = '/import';
  else if (path.startsWith('/admin/migrations/')) url.pathname = path.replace('/admin/migrations/', '/import/packages/');
  else if (path === '/editor' && url.searchParams.get('importJobId')) {
    url.pathname = `/import/jobs/${encodeURIComponent(url.searchParams.get('importJobId')!)}`;
    url.searchParams.delete('importJobId');
  } else return null;
  return url;
}
export function importJobHref(id: string, query?: Record<string, string>) {
  const params = new URLSearchParams(query);
  return `/import/jobs/${encodeURIComponent(id)}${params.size ? `?${params}` : ''}`;
}
export function importErrorHref(href: string, code: string) {
  const url = new URL(href, 'http://atlas.local'); url.searchParams.set('error', code);
  return url.pathname + url.search + url.hash;
}
