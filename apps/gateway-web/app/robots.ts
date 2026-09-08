import type { MetadataRoute } from 'next';
import { absoluteUrl } from '../lib/site-url';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/editor', '/admin', '/account', '/login', '/reset', '/invite', '/search'],
    },
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
