import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { PageMain } from '../../../../components/PageMain';
import { PrintLink } from '../../../../components/PrintLink';
import { SiteSearchForm } from '../../../../components/SiteSearchForm';
import { ServiceUnavailable } from '../../../../components/StatusMessage';
import { Alert, Badge, PageHeader, Pager } from '../../../../components/ui';
import { VersionReader } from '../../../../components/VersionReader';
import {
  ApiUnavailableError,
  listAllArticles,
  listAmendments,
  getCountry,
  type ArticleSummary,
  type CountryDetail,
} from '../../../../../lib/api';
import { neighborCompareLinks, orderVersions } from '../../../../../lib/compare';
import { FormattedDate } from '../../../../../lib/format-date';
import { canVisitEditor } from '../../../../../lib/nav';
import { atlasTitle, metaDescription, pageMetadata } from '../../../../../lib/page-meta';
import { httpUrl, provenanceLabel, verificationLabel } from '../../../../../lib/provenance';
import { currentUser } from '../../../../../lib/session';

type VersionPageProps = {
  params: Promise<{ code: string; versionId: string }>;
  searchParams: Promise<{ error?: string }>;
};

export async function generateMetadata(props: VersionPageProps): Promise<Metadata> {
  const params = await props.params;
  try {
    const country = await getCountry(params.code);
    const version = country?.constitutions
      .flatMap((c) => c.versions.map((v) => ({ constitution: c, version: v })))
      .find((row) => row.version.id === params.versionId);
    if (!country || !version) {
      return { title: atlasTitle('Version') };
    }
    return pageMetadata({
      title: atlasTitle(version.version.versionLabel, version.constitution.title, country.name),
      description: metaDescription(
        `Read ${version.constitution.title} version ${version.version.versionLabel} for ${country.name}.`,
      ),
      path: `/countries/${country.isoCode}/versions/${params.versionId}`,
    });
  } catch {
    return { title: atlasTitle('Version') };
  }
}

export default async function VersionPage(props: VersionPageProps) {
  const params = await props.params;
  const searchParams = await props.searchParams;
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
      <PageMain className="wide">
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
  const currentIndex = line.findIndex((item) => item.id === params.versionId);
  const previousPublished = currentIndex > 0 ? line[currentIndex - 1] : undefined;
  const nextPublished = currentIndex >= 0 ? line[currentIndex + 1] : undefined;
  const neighbors = neighborCompareLinks(country.isoCode, line, params.versionId);
  const user = await currentUser();
  const canEditTitles = Boolean(user && canVisitEditor(user.roles));
  const changeByArticle: Record<string, string> = {};
  try {
    for (const amendment of (await listAmendments(params.versionId)) ?? []) {
      for (const change of amendment.changes) {
        if (change.articleNumber && !changeByArticle[change.articleNumber]) {
          changeByArticle[change.articleNumber] = change.changeType;
        }
      }
    }
  } catch {
    /* amendment history is optional on the reader */
  }

  const sourceHref = httpUrl(version.version.sourceUrl);
  const title = version.version.effectiveDate ? (
    <>
      Version in force since <FormattedDate value={version.version.effectiveDate} />
    </>
  ) : (
    `Version ${version.version.versionLabel}`
  );

  return (
    <PageMain className="wide">
      <PageHeader
        breadcrumbs={[
          { href: '/', label: 'Countries' },
          { href: `/countries/${country.isoCode}`, label: country.name },
          { label: version.version.versionLabel },
        ]}
        eyebrow={`${country.name} · ${version.constitution.title}`}
        title={title}
        meta={
          <>
            {version.version.latestPublished ? <Badge tone="accent">Latest</Badge> : null}
            <Badge tone="info">{verificationLabel(version.version)}</Badge>
            <span>{version.version.languageCode}</span>
            {version.version.gazetteReference ? <span>{version.version.gazetteReference}</span> : null}
            <span>{provenanceLabel(version.version.provenance)}</span>
            {sourceHref ? (
              <a href={sourceHref} rel="noreferrer">
                Source
              </a>
            ) : null}
          </>
        }
        actions={
          <>
            <a className="btn" href={`/countries/${country.isoCode}/timeline`}>
              Timeline
            </a>
            {neighbors.previous ? (
              <a className="btn" href={neighbors.previous.href}>
                Compare with previous
              </a>
            ) : null}
            <PrintLink />
          </>
        }
      />
      <SiteSearchForm
        id="version-search"
        className="version-search"
        country={country.isoCode}
        versionId={params.versionId}
        visibleLabel
        submitClassName="btn"
      />
      {searchParams.error === 'title' ? (
        <Alert tone="error">The section title could not be saved.</Alert>
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
          language={version.version.languageCode}
          changeByArticle={changeByArticle}
          unchangedSinceLabel={previousPublished?.versionLabel}
        />
      )}
      <Pager
        previous={
          previousPublished
            ? {
                href: `/countries/${country.isoCode}/versions/${previousPublished.id}`,
                label: `← ${previousPublished.versionLabel}`,
              }
            : undefined
        }
        next={
          nextPublished
            ? {
                href: `/countries/${country.isoCode}/versions/${nextPublished.id}`,
                label: `${nextPublished.versionLabel} →`,
              }
            : undefined
        }
      />
    </PageMain>
  );
}
