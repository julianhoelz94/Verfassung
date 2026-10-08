import { notFound } from 'next/navigation';
import { PageMain } from '../../../../components/PageMain';
import { PageHeader } from '../../../../components/ui';
import { WikiImages } from '../../../../components/WikiImages';
import { getCountry, getWikiPage } from '../../../../../lib/api';
import { publicVersions } from '../../../../../lib/reading';

type Props = { params: Promise<{ code: string; constitutionId: string }> };

export default async function ConstitutionOverview({ params }: Props) {
  const { code, constitutionId } = await params;
  const country = await getCountry(code);
  if (!country) notFound();
  const constitution = country.constitutions.find((item) => item.id === constitutionId);
  if (!constitution) notFound();
  const wiki = await getWikiPage('constitution', constitutionId).catch(() => null);
  const versions = publicVersions(constitution.versions);

  return (
    <PageMain className="wide">
      <PageHeader
        breadcrumbs={[
          { href: '/', label: 'Countries' },
          { href: `/countries/${country.isoCode}`, label: country.name },
          { label: constitution.title },
        ]}
        title={constitution.title}
      />
      <p>
        {constitution.interim ? 'Interim constitution · ' : ''}
        {constitution.lifecycleStatus === 'in_force' ? 'In force' :
          constitution.lifecycleStatus === 'awaiting_commencement' ? 'Adopted, not yet in force' :
          constitution.lifecycleStatus === 'suspended' ? 'Suspended' :
          constitution.lifecycleStatus === 'repealed' ? 'Repealed' : 'Status not recorded'}
      </p>
      {wiki ? (
        <section className="card">
          <h2>About this constitution</h2>
          <p>{wiki.summary}</p>
          {wiki.body ? <p className="wiki-body">{wiki.body}</p> : null}
          <WikiImages images={wiki.images} />
        </section>
      ) : null}
      <section>
        <h2>Versions</h2>
        {versions.length === 0 ? <p>No published versions yet.</p> : (
          <ul>
            {versions.map((version) => (
              <li key={version.id}>
                <a href={`/countries/${country.isoCode}/versions/${version.currentVersionId ?? version.id}`}>{version.versionLabel}</a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageMain>
  );
}
