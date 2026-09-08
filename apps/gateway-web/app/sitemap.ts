import type { MetadataRoute } from 'next';
import { getCountry, listAllArticles, listCountries } from '../lib/api';
import { absoluteUrl } from '../lib/site-url';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [{ url: absoluteUrl('/'), lastModified: new Date() }];

  let countries;
  try {
    countries = (await listCountries()) ?? [];
  } catch {
    return entries;
  }

  for (const country of countries) {
    entries.push({
      url: absoluteUrl(`/countries/${country.isoCode}`),
      lastModified: new Date(),
    });

    let detail;
    try {
      detail = await getCountry(country.isoCode);
    } catch {
      continue;
    }
    if (!detail) {
      continue;
    }

    for (const constitution of detail.constitutions) {
      for (const version of constitution.versions) {
        entries.push({
          url: absoluteUrl(`/countries/${country.isoCode}/versions/${version.id}`),
          lastModified: new Date(),
        });

        let articles;
        try {
          articles = await listAllArticles(version.id, false);
        } catch {
          continue;
        }

        for (const article of articles) {
          entries.push({
            url: absoluteUrl(
              `/countries/${country.isoCode}/versions/${version.id}/articles/${article.id}`,
            ),
            lastModified: new Date(),
          });
        }
      }
    }
  }

  return entries;
}
