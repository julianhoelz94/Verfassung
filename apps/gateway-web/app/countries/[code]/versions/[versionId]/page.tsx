import { notFound } from 'next/navigation';
import { Breadcrumbs } from '../../../../components/Breadcrumbs';
import { PageMain } from '../../../../components/PageMain';
import { Provenance } from '../../../../components/Provenance';
import { ServiceUnavailable } from '../../../../components/StatusMessage';
import { VersionReader } from '../../../../components/VersionReader';
import { ApiUnavailableError, listAllArticles, getCountry, type ArticleSummary, type CountryDetail } from '../../../../../lib/api';
import { neighborCompareLinks, orderVersions } from '../../../../../lib/compare';
import { canVisitEditor } from '../../../../../lib/nav';
import { currentUser } from '../../../../../lib/session';
import { CompareForm } from '../../CompareForm';

type VersionPageProps = {
  params: { code: string; versionId: string };
};

export default async function VersionPage({ params }: VersionPageProps) {
  let country: CountryDetail | null = null;
  let articles: ArticleSummary[] = [];
  let error: string | null = null;
  try {
    country = await getCountry(params.code);
    articles = await listAllArticles(params.versionId, true);
  } catch (e) {
    error = e instanceof ApiUnavailableError ? e.message : 'A backend service is unavailable';
    country = null;
    articles = [];
  }

  if (error) {
    return (
      <PageMain>
        <ServiceUnavailable service="Content" retryHref={`/countries/${params.code}/versions/${params.versionId}`} />
      </PageMain>
    );
  }

  const version = country?.constitutions
    .flatMap((c) => c.versions.map((v) => ({ constitution: c, version: v })))
    .find((row) => row.version.id === params.versionId);

  if (!country || !version) {
    notFound();
  }

  const line = orderVersions(version.constitution.versions);
  const neighbors = neighborCompareLinks(country.isoCode, line, params.versionId);
  const user = await currentUser();
  const canEditTitles = Boolean(user && canVisitEditor(user.roles));

  return (
    <PageMain>
      <Breadcrumbs
        items={[
          { href: '/', label: 'Countries' },
          { href: `/countries/${country.isoCode}`, label: country.name },
          { label: version.version.versionLabel },
        ]}
      />
      <h1>{version.constitution.title}</h1>
      <p>Version {version.version.versionLabel}</p>
      <Provenance version={version.version} />
      <div className="actions">
        <a href={`/countries/${country.isoCode}/timeline`}>Amendment timeline</a>
        {neighbors.previous ? <a href={neighbors.previous.href}>{neighbors.previous.label}</a> : null}
        {neighbors.next ? <a href={neighbors.next.href}>{neighbors.next.label}</a> : null}
      </div>
      {line.length > 2 ? (
        <CompareForm
          code={country.isoCode}
          versions={line}
          fromId={params.versionId}
          toId={
            neighbors.next
              ? line[line.findIndex((item) => item.id === params.versionId) + 1]?.id
              : line[line.length - 1]?.id
          }
        />
      ) : null}
      {articles.length === 0 ? (
        <p>No articles are published in this version.</p>
      ) : (
        <VersionReader
          code={country.isoCode}
          versionId={params.versionId}
          articles={articles}
          outline={version.constitution.contentOutline}
          canEditTitles={canEditTitles}
        />
      )}
    </PageMain>
  );
}
