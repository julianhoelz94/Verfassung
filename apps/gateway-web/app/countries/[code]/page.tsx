import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { PageMain } from '../../components/PageMain';
import { ServiceUnavailable } from '../../components/StatusMessage';
import { WikiImages } from '../../components/WikiImages';
import { WikiSources } from '../../components/WikiSources';
import { Chip, PageHeader } from '../../components/ui';
import { ApiUnavailableError, getCountry, getWikiPage, type CountryDetail } from '../../../lib/api';
import { canVisitEditor } from '../../../lib/nav';
import { currentUser } from '../../../lib/session';
import { orderVersions } from '../../../lib/compare';
import { atlasTitle, metaDescription, pageMetadata } from '../../../lib/page-meta';
import { chainTipId, publicVersions } from '../../../lib/reading';
import { CompareForm } from './CompareForm';
import { listDocumentLinks } from '../../../lib/document-api';

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
  const canRecordLifecycle = user?.roles.some((role) => role === 'publisher' || role === 'admin') ?? false;
  const countryWiki = await getWikiPage('country', country.id).catch(() => null);
  const constitutionWikis = new Map(
    await Promise.all(country.constitutions.map(async (constitution) => [
      constitution.id,
      await getWikiPage('constitution', constitution.id).catch(() => null),
    ] as const)),
  );

  const versionTotal = country.constitutions.reduce(
    (sum, item) => sum + publicVersions(item.versions).length,
    0,
  );
  const documentsByConstitution = new Map(await Promise.all(country.constitutions.map(async (constitution) =>
    [constitution.id, await listDocumentLinks('constitution', constitution.id).catch(() => [])] as const,
  )));

  return (
    <PageMain className="wide">
      <PageHeader
        breadcrumbs={[{ href: '/', label: 'Countries' }, { label: country.name }]}
        title={<>{country.name}<span className="country-title-code" aria-hidden="true">{country.isoCode}</span></>}
        meta={
          <>
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
          <>
            <a className="btn btn-sm" href={`/countries/${country.isoCode}/constitution-timeline`}>Constitution timeline</a>
            <a className="btn btn-sm" href={`/countries/${country.isoCode}/timeline`}>Amendment timeline</a>
          </>
        }
      />
      {countryWiki ? (
        <section className="card">
          <h2>About {country.name}</h2>
          <p>{countryWiki.summary}</p>
          {countryWiki.body ? <p className="wiki-body">{countryWiki.body}</p> : null}
          <WikiImages images={countryWiki.images} />
          <WikiSources sourceUrls={countryWiki.sourceUrls ?? []} />
        </section>
      ) : null}
      {showEditorialLinks ? (
        <p><a href={`/editor/wiki/country/${country.id}?code=${country.isoCode}`}>Edit country page</a></p>
      ) : null}
      {country.constitutions.map((constitution) => {
        const publicLine = orderVersions(publicVersions(constitution.versions));
        const tipId = chainTipId(constitution);
        const newestPublic = publicLine[publicLine.length - 1];
        const previousPublic = publicLine.length >= 2 ? publicLine[publicLine.length - 2] : undefined;
        return (
          <section key={constitution.id} className="card">
            <h2 className="card-title">
              <a href={`/countries/${country.isoCode}/constitutions/${constitution.id}`}>{constitution.title}</a>
            </h2>
            {constitutionWikis.get(constitution.id) ? (
              <p>{constitutionWikis.get(constitution.id)?.summary}</p>
            ) : null}
            {showEditorialLinks ? (
              <p><a href={`/editor/wiki/constitution/${constitution.id}?code=${country.isoCode}`}>Edit constitution page</a></p>
            ) : null}
            {canRecordLifecycle ? (
              <p><a href={`/editor/lifecycle/${constitution.id}?code=${country.isoCode}`}>Record lifecycle event</a></p>
            ) : null}
            <p className="muted">
              {constitution.interim ? 'Interim constitution · ' : ''}
              {constitution.lifecycleStatus === 'in_force' ? 'In force' :
                constitution.lifecycleStatus === 'awaiting_commencement' ? 'Adopted, not yet in force' :
                constitution.lifecycleStatus === 'suspended' ? 'Suspended' :
                constitution.lifecycleStatus === 'uncertain' ? 'Status uncertain' :
                constitution.lifecycleStatus === 'repealed' ? 'Repealed' : 'Status not recorded'}
            </p>
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
            {(documentsByConstitution.get(constitution.id) ?? []).length ? <div>
              <h3>Documents</h3>
              <ul className="link-list">{(documentsByConstitution.get(constitution.id) ?? []).map((link) => <li key={link.documentId}>
                <a href={`/documents/${link.documentId}${link.revisionId ? `?revision=${link.document.revision.revision}` : ''}`}>{link.document.revision.title}</a>
              </li>)}</ul>
            </div> : null}
            <h3 className="country-compare-heading">Compare versions</h3>
            <CompareForm code={country.isoCode} versions={publicLine} variant="inline" />
          </section>
        );
      })}
    </PageMain>
  );
}
