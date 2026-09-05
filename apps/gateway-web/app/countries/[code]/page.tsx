import { notFound } from 'next/navigation';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { PageMain } from '../../components/PageMain';
import { Provenance } from '../../components/Provenance';
import { ServiceUnavailable } from '../../components/StatusMessage';
import { ApiUnavailableError, getCountry, type CountryDetail } from '../../../lib/api';
import { orderVersions } from '../../../lib/compare';
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
      <PageMain>
        <ServiceUnavailable service="Catalog" retryHref={`/countries/${params.code}`} />
      </PageMain>
    );
  }

  if (!country) {
    notFound();
  }

  return (
    <PageMain>
      <Breadcrumbs items={[{ href: '/', label: 'Countries' }, { label: country.name }]} />
      <h1>{country.name}</h1>
      <div className="actions">
        <a href={`/countries/${country.isoCode}/timeline`}>Amendment timeline</a>
      </div>
      {country.constitutions.map((constitution) => {
        const versions = orderVersions(constitution.versions);
        return (
          <section key={constitution.id}>
            <h2>{constitution.title}</h2>
            {constitution.contentOutline && constitution.contentOutline.kinds.length > 0 ? (
              <p className="muted">
                Structure:{' '}
                {constitution.contentOutline.kinds.map((kind) => kind.displayLabel).join(' → ')}
              </p>
            ) : null}
            <ul>
              {versions.map((version) => (
                <li key={version.id}>
                  <a href={`/countries/${country.isoCode}/versions/${version.id}`}>
                    {version.versionLabel}
                    {version.effectiveDate ? ` (${version.effectiveDate})` : ''}
                    {version.latestPublished ? ' · latest published' : ''}
                  </a>
                  <Provenance version={version} />
                </li>
              ))}
            </ul>
            <h3>Compare versions</h3>
            <CompareForm code={country.isoCode} versions={versions} />
          </section>
        );
      })}
    </PageMain>
  );
}
