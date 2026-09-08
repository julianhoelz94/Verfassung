export function publicBaseUrl(): string {
  return process.env.PUBLIC_BASE_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost';
}

export function absoluteUrl(path: string): string {
  const base = publicBaseUrl().replace(/\/$/, '');
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}
