import type { Metadata } from 'next';
import { absoluteUrl } from './site-url';

export function atlasTitle(...parts: string[]): string {
  const filtered = parts.filter((part) => part.trim().length > 0);
  if (filtered.length === 0) {
    return 'Constitution Atlas';
  }
  return `${filtered.join(' · ')} — Constitution Atlas`;
}

export function metaDescription(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= 160) {
    return collapsed;
  }
  return `${collapsed.slice(0, 157)}...`;
}

export function pageMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const url = absoluteUrl(path);
  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      url,
    },
  };
}
