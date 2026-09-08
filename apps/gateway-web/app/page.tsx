import {
  ApiUnavailableError,
  getCountry,
  listAmendments,
  listArticlePage,
  listCountries,
  type CountryDetail,
} from '../lib/api';
import { PageMain } from './components/PageMain';
import { SiteSearchForm } from './components/SiteSearchForm';
import { ServiceUnavailable } from './components/StatusMessage';
import { Badge } from './components/ui';
import {
  latestVersion,
  newestChanges,
  previousVersion,
  recentChangesFromAmendments,
  type RecentChange,
} from '../lib/reading';

export default async function Page() {
  let error: string | null = null;
  let details: CountryDetail[] = [];
  try {
    const countries = (await listCountries()) ?? [];
    const loaded = await Promise.all(countries.map((country) => getCountry(country.isoCode)));
    details = loaded.filter((country): country is CountryDetail => country != null);
  } catch (e) {
    error = e instanceof ApiUnavailableError ? e.message : 'Catalog is unavailable';
  }

  if (error) {
    return (
      <PageMain className="wide">
        <ServiceUnavailable service="Catalog" retryHref="/" />
      </PageMain>
    );
  }

  let versionCount = 0;
  let articleCount = 0;
  let amendmentCount = 0;
  const articlesByCountry = new Map<string, number>();
  const recent: RecentChange[] = [];
  for (const country of details) {
    for (const constitution of country.constitutions) {
      versionCount += constitution.versions.length;
      const latest = latestVersion(constitution.versions);
      if (!latest) {
        continue;
      }
      try {
        const page = await listArticlePage(latest.id, 0, 1);
        const total = page?.total ?? 0;
        articleCount += total;
        articlesByCountry.set(country.isoCode, (articlesByCountry.get(country.isoCode) ?? 0) + total);
      } catch {
        /* content is optional on the home stats */
      }
      try {
        const amendments = (await listAmendments(latest.id)) ?? [];
        amendmentCount += amendments.length;
        recent.push(...recentChangesFromAmendments(country, latest, amendments));
      } catch {
        /* amendment service down: skip recently changed */
      }
    }
  }
  const recentTop = newestChanges(recent, 5);

  return (
    <PageMain className="wide">
      <section className="hero">
        <p className="eyebrow">Versioned constitutions</p>
        <h1 className="page-title">Read a constitution as it stood on any date.</h1>
        <p className="lede">
          Browse official texts by country and version, follow every amendment, and compare how a
          constitution changed over time.
        </p>
        <SiteSearchForm
          id="home-search"
          className="hero-search"
          placeholder="Try “human dignity” or “Art. 20”"
          submitClassName="btn btn-primary"
          ariaLabel="Search published articles"
        />
        <div className="stats">
          <div>
            <strong>{details.length}</strong>countries
          </div>
          <div>
            <strong>{versionCount}</strong>published versions
          </div>
          <div>
            <strong>{articleCount}</strong>articles
          </div>
          <div>
            <strong>{amendmentCount}</strong>amendments recorded
          </div>
        </div>
      </section>
      <h2 className="section-title">Countries</h2>
      {details.length === 0 ? (
        <p>No countries are published yet.</p>
      ) : (
        <div className="card-grid">
          {details.map((country) => {
            const constitution = country.constitutions[0];
            const versions = constitution?.versions ?? [];
            const latest = latestVersion(versions);
            const previous = previousVersion(versions);
            const countryArticles = articlesByCountry.get(country.isoCode);
            return (
              <article key={country.id} className="card country-card">
                <div className="iso" aria-hidden="true">
                  {country.isoCode}
                </div>
                <div>
                  <h3 className="card-title">
                    <a href={`/countries/${country.isoCode}`}>{country.name}</a>
                  </h3>
                  {country.constitutions.length > 0 ? (
                    <p className="muted">{country.constitutions.map((item) => item.title).join(' · ')}</p>
                  ) : null}
                  <div className="card-meta">
                    {latest ? <Badge tone="accent">Latest: {latest.versionLabel}</Badge> : null}
                    <span>
                      {versions.length} version{versions.length === 1 ? '' : 's'}
                    </span>
                    {countryArticles != null ? (
                      <span>
                        {countryArticles} article{countryArticles === 1 ? '' : 's'}
                      </span>
                    ) : null}
                    {latest ? <span>{latest.languageCode}</span> : null}
                  </div>
                  <div className="card-actions">
                    {latest ? (
                      <a className="btn btn-sm" href={`/countries/${country.isoCode}/versions/${latest.id}`}>
                        Read latest
                      </a>
                    ) : null}
                    {latest && previous ? (
                      <a
                        className="btn btn-sm btn-ghost"
                        href={`/countries/${country.isoCode}/compare?from=${previous.id}&to=${latest.id}`}
                      >
                        Compare {previous.versionLabel} → {latest.versionLabel}
                      </a>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {recentTop.length > 0 ? (
        <>
          <h2 className="section-title">Recently changed</h2>
          <ul className="stack">
            {recentTop.map((row, index) => (
              <li key={`${row.versionId}-${row.articleNumber}-${index}`}>
                <Badge>{row.changeType}</Badge>{' '}
                {row.articleNumber ? `Article ${row.articleNumber}` : 'An article'}{' '}
                <span className="muted">
                  {row.countryName}
                  {row.date ? ` · ${row.date}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </PageMain>
  );
}
