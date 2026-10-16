import { T, ui } from './components/TranslationProvider';
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
import { requestAnonymousBrowsingPolicy } from '../lib/anonymous-browsing-policy';
import { currentUser } from '../lib/session';
import {
  chainTipId,
  newestChanges,
  publicVersions,
  recentChangesFromAmendments,
  type RecentChange,
} from '../lib/reading';

export default async function Page() {
  const policy = await requestAnonymousBrowsingPolicy().catch(() => null);
  if (!policy?.allowed && !(await currentUser())) {
    return <PageMain className="wide">
      <section className="hero">
        <h1 className="page-title"><T value={ui.page.constitutionAtlas} /></h1>
        <p className="lede">{policy ? 'Sign in to browse constitutions.' : 'Browsing settings are temporarily unavailable.'}</p>
        <a className="btn btn-primary" href="/login"><T value={ui.page.logIn} /></a>
      </section>
    </PageMain>;
  }
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
        <p className="eyebrow"><T value={ui.page.versionedConstitutions} /></p>
        <h1 className="page-title"><T value={ui.page.readAConstitutionAsItStoodOn} /></h1>
        <p className="lede">
          <T value={ui.page.browseOfficialTextsByCountryAndVersion} />{" "}</p>
        <SiteSearchForm
          id="home-search"
          className="hero-search"
          placeholder="Try “human dignity” or “Art. 20”"
          submitClassName="btn btn-primary"
          ariaLabel="Search published articles"
        />
        <div className="stats">
          <div>
            <strong>{details.length}</strong><T value={ui.page.countries} />{" "}</div>
          <div>
            <strong>{versionCount}</strong><T value={ui.page.publishedVersions} />{" "}</div>
          <div>
            <strong>{articleCount}</strong><T value={ui.page.articles} />{" "}</div>
          <div>
            <strong>{amendmentCount}</strong><T value={ui.page.amendmentsRecorded} />{" "}</div>
        </div>
      </section>
      <h2 className="section-title"><T value={ui.page.countries2} /></h2>
      {countries.length === 0 ? (
        <p><T value={ui.page.noCountriesArePublishedYet} /></p>
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
                      <Badge tone="accent"><T value={ui.page.latest} />{" "}{tipVersion.versionLabel}</Badge>
                    ) : summary.latestVersionLabel ? (
                      <Badge tone="accent"><T value={ui.page.latest} />{" "}{summary.latestVersionLabel}</Badge>
                    ) : null}
                    <span>
                      {summary.versionCount} <T value={ui.page.version} />{summary.versionCount === 1 ? '' : 's'}
                    </span>
                    {summary.latestEffectiveDate ? (
                      <span>
                        <T value={ui.page.inForceSince} />{" "}<FormattedDate value={summary.latestEffectiveDate} />
                      </span>
                    ) : null}
                    {countryArticles != null ? (
                      <span>
                        {countryArticles} <T value={ui.page.article} />{countryArticles === 1 ? '' : 's'}
                      </span>
                    ) : null}
                    {tipVersion ? <span>{tipVersion.languageCode}</span> : null}
                  </div>
                  <div className="card-actions">
                    {tipId ? (
                      <a className="btn btn-sm" href={`/countries/${summary.isoCode}/versions/${tipId}`}>
                        <T value={ui.page.readLatest} />{" "}</a>
                    ) : null}
                    {publicLine.length >= 2 && previous && tipId ? (
                      <a
                        className="btn btn-sm btn-ghost"
                        href={`/countries/${summary.isoCode}/compare?from=${previous.id}&to=${publicLine[publicLine.length - 1]?.id}`}
                      >
                        <T value={ui.page.compare} />{" "}{previous.versionLabel} → {publicLine[publicLine.length - 1]?.versionLabel}
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
          <h2 className="section-title"><T value={ui.page.recentlyChanged} /></h2>
          <ul className="recent-list">
            {recentTop.map((row, index) => (
              <li key={`${row.versionId}-${row.articleNumber}-${index}`}>
                <Badge>{row.changeType}</Badge>
                <span>{row.articleNumber ? `Article ${row.articleNumber}` : 'An article'}</span>
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
