import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { PageMain } from '../../components/PageMain';
import { ServiceUnavailable } from '../../components/StatusMessage';
import { Badge, Chip, PageHeader } from '../../components/ui';
import { ApiUnavailableError, getCountry, type CountryDetail } from '../../../lib/api';
import { canVisitEditor } from '../../../lib/nav';
import { currentUser } from '../../../lib/session';
import { orderVersions } from '../../../lib/compare';
import { atlasTitle, metaDescription, pageMetadata } from '../../../lib/page-meta';
import { chainTipId, publicVersions } from '../../../lib/reading';
import { CompareForm } from './CompareForm';

type CountryPageProps = {
  params: Promise<{ code: string }>;
};

export async function generateMetadata(props: CountryPageProps): Promise<Metadata> {
  const params = await props.params;
  try {
    const { code } = params;
    const country = await getCountry(code);
    if (!country) {
      return { title: atlasTitle('Country') };
    }
    return pageMetadata({
      title: atlasTitle(country.name),
      description: metaDescription(`Browse constitutions and versions for ${country.name}.`),
      path: `/countries/${country.isoCode}`,
    });
  } catch {
    return { title: atlasTitle('Country') };
  }
}

export default async function CountryPage(props: CountryPageProps) {
  const params = await props.params;
  const { code } = params;
  let country: CountryDetail | null = null;
  let error: string | null = null;
  try {
    country = await getCountry(code);
  } catch (e) {
    error = e instanceof ApiUnavailableError ? e.message : 'Catalog is unavailable';
    country = null;
  }

  if (error) {
    return (
      <PageMain className="wide">
        <ServiceUnavailable service="Catalog" retryHref={`/countries/${code}`} />
      </PageMain>
    );
  }

  if (!country) {
    notFound();
  }

  const user = await currentUser();
  const showEditorialLinks = user ? canVisitEditor(user.roles) : false;

  const versionTotal = country.constitutions.reduce(
    (sum, item) => sum + publicVersions(item.versions).length,
    0,
  );

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
        const publicLine = orderVersions(publicVersions(constitution.versions));
        const tipId = chainTipId(constitution);
        const tipVersion = constitution.versions.find((version) => version.id === tipId);
        const newestPublic = publicLine[publicLine.length - 1];
        const previousPublic = publicLine.length >= 2 ? publicLine[publicLine.length - 2] : undefined;
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
              {publicLine.map((version) => (
                <Chip
                  key={version.id}
                  href={`/countries/${country.isoCode}/versions/${version.id}`}
                  active={version.id === newestPublic?.id}
                >
                  {version.versionLabel}
                </Chip>
              ))}
            </div>
            <div className="card-actions">
              <a className="btn btn-sm" href={`/countries/${country.isoCode}/timeline`}>
                Timeline
              </a>
              {showEditorialLinks ? (
                <a
                  className="btn btn-sm btn-ghost"
                  href={`/editor/history?constitutionId=${encodeURIComponent(constitution.id)}`}
                >
                  Version history
                </a>
              ) : null}
              {tipId ? (
                <a className="btn btn-sm btn-ghost" href={`/countries/${country.isoCode}/versions/${tipId}`}>
                  Read latest
                </a>
              ) : null}
              {previousPublic && newestPublic ? (
                <a
                  className="btn btn-sm btn-ghost"
                  href={`/countries/${country.isoCode}/compare?from=${previousPublic.id}&to=${newestPublic.id}`}
                >
                  Compare
                </a>
              ) : null}
            </div>
            {tipVersion ? <Badge tone="accent">Latest: {tipVersion.versionLabel}</Badge> : null}
            <h3>Compare versions</h3>
            <CompareForm code={country.isoCode} versions={publicLine} variant="inline" />
          </section>
        );
      })}
    </PageMain>
  );
}
