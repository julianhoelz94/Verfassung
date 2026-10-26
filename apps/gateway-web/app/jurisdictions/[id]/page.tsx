import { notFound } from 'next/navigation';
import { CollectionPage } from '../../components/layout/templates';
import { PageHeader } from '../../components/ui';
import { T } from '../../components/TranslationProvider';
import { getJurisdiction } from '../../../lib/migration-api';
import { migrationUi } from '../../../lib/migration-messages';
import { FormattedDate } from '../../../lib/format-date';

export default async function JurisdictionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getJurisdiction(id);
  if (!detail) notFound();
  const entity = detail.jurisdiction;
  return <CollectionPage width="content" header={<PageHeader title={entity.name} breadcrumbs={[
    { href: '/jurisdictions', label: <T value={migrationUi.jurisdictions} /> },
    ...detail.ancestors.map(item => ({ href: `/jurisdictions/${item.id}`, label: item.name })), { label: entity.name },
  ]} />}>
    {entity.historical ? <p><T value={migrationUi.historical} /></p> : null}
    {entity.existedFrom || entity.existedUntil ? <p><FormattedDate value={entity.existedFrom} /> – <FormattedDate value={entity.existedUntil} /></p> : null}
    {detail.children.length ? <section><h2><T value={migrationUi.children} /></h2><ul>{detail.children.map(item => <li key={item.id}><a href={`/jurisdictions/${item.id}`}>{item.name}</a>{item.historical ? <> · <T value={migrationUi.historical} /></> : null}</li>)}</ul></section> : null}
    <section><h2><T value={migrationUi.constitutions} /></h2>
      {detail.constitutions.length ? detail.constitutions.map(constitution => <article key={constitution.id}>
        <h3>{constitution.title}</h3><ul>{constitution.versions.map(version => <li key={version.id}>
          <a href={`/jurisdictions/${id}/versions/${version.currentVersionId ?? version.id}`}>{version.versionLabel}</a>
        </li>)}</ul>
      </article>) : <p><T value={migrationUi.noConstitutions} /></p>}
    </section>
  </CollectionPage>;
}
