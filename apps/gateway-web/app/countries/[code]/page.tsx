import { notFound } from 'next/navigation';
import { PageMain } from '../../components/PageMain';
import { ServiceUnavailable } from '../../components/StatusMessage';
import { Badge, Chip, PageHeader } from '../../components/ui';
import { ApiUnavailableError, getCountry, type CountryDetail } from '../../../lib/api';
import { orderVersions } from '../../../lib/compare';
import { latestVersion, previousVersion } from '../../../lib/reading';
import { CompareForm } from './CompareForm';

type CountryPageProps = {
  params: { code: string };
};

export default async function CountryPage({ params }: CountryPageProps) {
  let country: CountryDetail | null = null;
  let error: string | null = null;
  try {
    country = await getCountry(params.code);
  } catch (e) {
    error = e instanceof ApiUnavailableError ? e.message : 'Catalog is unavailable';
    country = null;
  }

  if (error) {
    return (
      <PageMain className="wide">
        <ServiceUnavailable service="Catalog" retryHref={`/countries/${params.code}`} />
      </PageMain>
    );
  }

  if (!country) {
    notFound();
  }

  const versionTotal = country.constitutions.reduce((sum, item) => sum + item.versions.length, 0);

  return (
    <PageMain className="wide">
      <PageHeader
        breadcrumbs={[{ href: '/', label: 'Countries' }, { label: country.name }]}
        title={country.name}
        meta={
          <>
            <span className="iso" aria-hidden="true">
              {country.isoCode}
            </span>
            <span>
              {country.constitutions.length} constitution
              {country.constitutions.length === 1 ? '' : 's'}
            </span>
            <span>
              {versionTotal} version{versionTotal === 1 ? '' : 's'}
            </span>
          </>
        }
        actions={
          <a className="btn btn-sm" href={`/countries/${country.isoCode}/timeline`}>
            Timeline
          </a>
        }
      />
      {country.constitutions.map((constitution) => {
        const versions = orderVersions(constitution.versions);
        const latest = latestVersion(versions);
        const previous = previousVersion(versions);
        return (
          <section key={constitution.id} className="card">
            <h2 className="card-title">{constitution.title}</h2>
            {constitution.contentOutline && constitution.contentOutline.kinds.length > 0 ? (
              <p className="muted">
                Structure:{' '}
                {constitution.contentOutline.kinds.map((kind) => kind.displayLabel).join(' → ')}
              </p>
            ) : null}
            <div className="chip-row">
              {versions.map((version) => (
                <Chip
                  key={version.id}
                  href={`/countries/${country.isoCode}/versions/${version.id}`}
                  active={version.id === latest?.id}
                >
                  {version.versionLabel}
                  {version.latestPublished ? ' · latest' : ''}
                </Chip>
              ))}
            </div>
            <div className="card-actions">
              <a className="btn btn-sm" href={`/countries/${country.isoCode}/timeline`}>
                Timeline
              </a>
              {latest && previous ? (
                <a
                  className="btn btn-sm btn-ghost"
                  href={`/countries/${country.isoCode}/compare?from=${previous.id}&to=${latest.id}`}
                >
                  Compare
                </a>
              ) : null}
            </div>
            {latest ? <Badge tone="accent">Latest: {latest.versionLabel}</Badge> : null}
            <h3>Compare versions</h3>
            <CompareForm code={country.isoCode} versions={versions} variant="inline" />
          </section>
        );
      })}
    </PageMain>
  );
}
