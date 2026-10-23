import { publicVersions, snapshotVersionId } from '../../../../../lib/reading';
import { changeTypeMessage, changeTypeTone } from '../../../../../lib/ui-labels';
import { T } from '../../../../components/TranslationProvider';
import { ui, type UiMessage } from '../../../../../lib/messages';
import { notFound } from 'next/navigation';
import { ConstitutionText } from '../../../../components/ConstitutionText';
import { ReaderPage } from '../../../../components/layout/templates';
import { Provenance } from '../../../../components/Provenance';
import { AmendmentUnitLinks } from '../../../../components/AmendmentUnitLinks';
import { ServiceUnavailable } from '../../../../components/StatusMessage';
import { Badge, PageHeader } from '../../../../components/ui';
import {
  ApiUnavailableError,
  getCountry,
  listAllArticles,
  listAmendmentsByArticle,
  type Amendment,
  type ArticleSummary,
  type CountryDetail,
  type VersionSummary,
} from '../../../../../lib/api';
import { orderVersions } from '../../../../../lib/compare';
import { FormattedDate } from '../../../../../lib/format-date';
import { Stack } from '../../../../components/layout/Layout';

type HistoryPageProps = {
  params: Promise<{ code: string; articleNumber: string }>;
};

type ArticleSnapshot = {
  version: VersionSummary;
  snapshotId: string;
  article: ArticleSummary;
  articles: ArticleSummary[];
};

export default async function ArticleHistoryPage(props: HistoryPageProps) {
  const params = await props.params;
  const articleNumber = decodeURIComponent(params.articleNumber);
  let country: CountryDetail | null = null;
  let error: string | null = null;
  try {
    country = await getCountry(params.code);
  } catch (e) {
    error = e instanceof ApiUnavailableError ? e.message : 'Catalog is unavailable';
  }

  if (error) {
    return (
      <ReaderPage width="reading">
        <ServiceUnavailable
          service={ui.services.catalog}
          retryHref={`/countries/${params.code}/articles/${encodeURIComponent(articleNumber)}`}
        />
      </ReaderPage>
    );
  }

  if (!country) {
    notFound();
  }

  const constitution =
    country.constitutions.find((item) =>
      item.versions.some((version) => version.latestPublished),
    ) ?? country.constitutions[0];
  if (!constitution) {
    notFound();
  }

  const versions = orderVersions(publicVersions(constitution.versions));
  let snapshots: ArticleSnapshot[] = [];
  let amendments: Amendment[] = [];
  let loadError: UiMessage | null = null;
  try {
    const versionArticles = await Promise.all(versions.map((version) => listAllArticles(snapshotVersionId(version), true)));
    snapshots = versions.flatMap((version, index) => {
      const articles = versionArticles[index] ?? [];
      const article = articles.find((item) => item.articleNumber === articleNumber);
      return article ? [{ version, snapshotId: snapshotVersionId(version), article, articles }] : [];
    });
  } catch (e) {
    loadError = ui.errors.servicesUnavailable;
  }
  try {
    amendments = (await listAmendmentsByArticle(constitution.id, articleNumber)) ?? [];
  } catch {
    /* amendment history is optional on this page */
  }

  if (!loadError && snapshots.length === 0) {
    notFound();
  }

  return (
    <ReaderPage width="reading" header={<PageHeader
        breadcrumbs={[
          { href: '/', label: <T value={ui.nav.countries} /> },
          { href: `/countries/${country.isoCode}`, label: country.name },
          { label: <><T value={ui.countries.code.versions.versionid.articles.articleid.page.historyOfArticle} /> {articleNumber}</> },
        ]}
        eyebrow={`${country.name} · ${constitution.title}`}
        title={<><T value={ui.countries.code.versions.versionid.articles.articleid.page.historyOfArticle} /> {articleNumber}</>}
      />}>

      {loadError ? <p role="alert"><T value={loadError} /></p> : null}
      <Stack>
        {snapshots.map((snapshot, index) => {
          const previous = snapshots[index - 1];
          const incoming = amendments.filter(
            (item) => item.targetVersionId != null && item.targetVersionId === snapshot.version.id,
          );
          const articlesByNumber = Object.fromEntries(
            snapshot.articles.map((item) => [item.articleNumber, item.id]),
          );
          return (
            <section key={snapshot.version.id} className="history-version">
              {previous ? (
                <Stack>
                  {incoming.map((amendment) =>
                    amendment.changes.map((change) => (
                      <div key={change.id} className="change-row">
                        <Badge tone={changeTypeTone(change.changeType)}>{<T value={changeTypeMessage(change.changeType)} />}</Badge>
                        <span className="muted">
                          {change.changedOn ? (
                            <>
                              <T value={ui.countries.code.articles.articlenumber.page.changed} />{" "}<FormattedDate value={change.changedOn} />
                            </>
                          ) : null}
                          {change.effectiveOn ? (
                            <>
                              {change.changedOn ? ' · ' : ''}
                              <T value={ui.countries.code.articles.articlenumber.page.effective} />{" "}<FormattedDate value={change.effectiveOn} />
                            </>
                          ) : null}
                          {amendment.sourceReference ? ` · ${amendment.sourceReference}` : ''}
                          {change.amendingLawTitle ? ` · ${change.amendingLawTitle}` : ''}
                          {change.amendingLawCitation ? ` · ${change.amendingLawCitation}` : ''}
                          {change.amendingLawCitationId &&
                          !change.amendingLawCitation &&
                          !amendment.sourceReference
                            ? ` · ${change.amendingLawCitationId}`
                            : ''}
                          {change.note ? ` · ${change.note}` : ''}
                        </span>
                        <AmendmentUnitLinks change={change} />
                      </div>
                    )),
                  )}
                  <a
                    className="btn"
                    href={`/countries/${country.isoCode}/compare?from=${encodeURIComponent(previous.version.id)}&to=${encodeURIComponent(snapshot.version.id)}`}
                  >
                    <T value={ui.countries.code.articles.articlenumber.page.compareWithPrevious} />{" "}</a>
                </Stack>
              ) : null}
              <h2>
                {snapshot.version.versionLabel}
                {snapshot.version.effectiveDate ? (
                  <>
                    {' · '}
                    <FormattedDate value={snapshot.version.effectiveDate} />
                  </>
                ) : null}
              </h2>
              <Provenance
                version={snapshot.version}
                labelSuffix={snapshot.version.versionLabel}
              />
              <ConstitutionText
                article={snapshot.article}
                headingLevel="h3"
                outline={constitution.contentOutline}
                lang={snapshot.version.languageCode}
                crossRefs={{
                  code: country.isoCode,
                  versionId: snapshot.snapshotId,
                  articlesByNumber,
                }}
              />
            </section>
          );
        })}
      </Stack>
    </ReaderPage>
  );
}
