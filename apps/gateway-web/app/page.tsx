import {
  ApiUnavailableError,
  getCountry,
  listArticlePage,
  listConstitutionAmendments,
  listCountries,
  type CountryDetail,
  type CountrySummary,
} from '../lib/api';
import { orderVersions } from '../lib/compare';
import { FormattedDate } from '../lib/format-date';
import { PageMain } from './components/PageMain';
import { SiteSearchForm } from './components/SiteSearchForm';
import { ServiceUnavailable } from './components/StatusMessage';
import { Badge } from './components/ui';
import {
  chainTipId,
  newestChanges,
  publicVersions,
  recentChangesFromAmendments,
  type RecentChange,
} from '../lib/reading';

export default async function Page() {
  let error: string | null = null;
  let countries: CountrySummary[] = [];
  let details: CountryDetail[] = [];
  try {
    countries = (await listCountries()) ?? [];
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
      versionCount += publicVersions(constitution.versions).length;
      const tipId = chainTipId(constitution);
      if (!tipId) {
        continue;
      }
      try {
        const page = await listArticlePage(tipId, 0, 1);
        const total = page?.total ?? 0;
        articleCount += total;
        articlesByCountry.set(country.isoCode, (articlesByCountry.get(country.isoCode) ?? 0) + total);
      } catch {
        /* content is optional on the home stats */
      }
      try {
        const amendments = (await listConstitutionAmendments(constitution.id)) ?? [];
        amendmentCount += amendments.length;
        recent.push(...recentChangesFromAmendments(country, constitution, amendments));
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
      {countries.length === 0 ? (
        <p>No countries are published yet.</p>
      ) : (
        <div className="card-grid">
          {countries.map((summary) => {
            const country = details.find((item) => item.isoCode === summary.isoCode);
            const constitution = country?.constitutions[0];
            const publicLine = constitution
              ? orderVersions(publicVersions(constitution.versions))
              : [];
            const tipId = constitution ? chainTipId(constitution) : summary.latestVersionId;
            const tipVersion = constitution?.versions.find((version) => version.id === tipId);
            const previous = publicLine.length >= 2 ? publicLine[publicLine.length - 2] : undefined;
            const countryArticles = country ? articlesByCountry.get(country.isoCode) : undefined;
            return (
              <article key={summary.id} className="card country-card">
                <div className="iso" aria-hidden="true">
                  {summary.isoCode}
                </div>
                <div>
                  <h3 className="card-title">
                    <a href={`/countries/${summary.isoCode}`}>{summary.name}</a>
                  </h3>
                  {country && country.constitutions.length > 0 ? (
                    <p className="muted">{country.constitutions.map((item) => item.title).join(' · ')}</p>
                  ) : null}
                  <div className="card-meta">
                    {tipVersion ? (
                      <Badge tone="accent">Latest: {tipVersion.versionLabel}</Badge>
                    ) : summary.latestVersionLabel ? (
                      <Badge tone="accent">Latest: {summary.latestVersionLabel}</Badge>
                    ) : null}
                    <span>
                      {summary.versionCount} version{summary.versionCount === 1 ? '' : 's'}
                    </span>
                    {summary.latestEffectiveDate ? (
                      <span>
                        In force since <FormattedDate value={summary.latestEffectiveDate} />
                      </span>
                    ) : null}
                    {countryArticles != null ? (
                      <span>
                        {countryArticles} article{countryArticles === 1 ? '' : 's'}
                      </span>
                    ) : null}
                    {tipVersion ? <span>{tipVersion.languageCode}</span> : null}
                  </div>
                  <div className="card-actions">
                    {tipId ? (
                      <a className="btn btn-sm" href={`/countries/${summary.isoCode}/versions/${tipId}`}>
                        Read latest
                      </a>
                    ) : null}
                    {publicLine.length >= 2 && previous && tipId ? (
                      <a
                        className="btn btn-sm btn-ghost"
                        href={`/countries/${summary.isoCode}/compare?from=${previous.id}&to=${publicLine[publicLine.length - 1]?.id}`}
                      >
                        Compare {previous.versionLabel} → {publicLine[publicLine.length - 1]?.versionLabel}
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
