import { CountryNavigation } from '../../../../components/CountryNavigation';
import { T } from '../../../../components/TranslationProvider';
import { ui } from '../../../../../lib/messages';
import { notFound } from 'next/navigation';
import { PageMain } from '../../../../components/PageMain';
import { PageHeader } from '../../../../components/ui';
import { WikiImages } from '../../../../components/WikiImages';
import { WikiBody } from '../../../../components/WikiBody';
import { ContentTranslationRegion } from '../../../../components/ContentTranslationRegion';
import { lifecycleStatusMessage } from '../../../../../lib/lifecycle-label';
import { WikiSources } from '../../../../components/WikiSources';
import { getConstitutionLifecycle, getCountry, getWikiPage } from '../../../../../lib/api';
import { publicVersions } from '../../../../../lib/reading';

type Props = { params: Promise<{ code: string; constitutionId: string }> };

export default async function ConstitutionOverview({ params }: Props) {
  const { code, constitutionId } = await params;
  const country = await getCountry(code);
  if (!country) notFound();
  const constitution = country.constitutions.find((item) => item.id === constitutionId);
  if (!constitution) notFound();
  const wiki = await getWikiPage('constitution', constitutionId).catch(() => null);
  const lifecycle = (await getConstitutionLifecycle(country.isoCode).catch(() => []))
    ?.filter((event) => event.constitutionId === constitutionId) ?? [];
  const versions = publicVersions(constitution.versions);

  return (
    <PageMain className="wide">
      <PageHeader
        breadcrumbs={[
          { href: '/', label: <T value={ui.nav.countries} /> },
          { href: `/countries/${country.isoCode}`, label: country.name },
          { label: constitution.title },
        ]}
        title={constitution.title}
      />
      <CountryNavigation code={code} active="reading" />
      <p>
        {constitution.interim ? <><T value={ui.lifecycle.interimConstitution} /> · </> : null}
        <T value={lifecycleStatusMessage(constitution.lifecycleStatus)} />
      </p>
      {lifecycle.length > 0 ? (
        <section>
          <h2><T value={ui.countries.code.constitutions.constitutionid.page.lifecycleDates} /></h2>
          <ul>{lifecycle.map((event) => (
            <li key={event.id}><time dateTime={event.eventDate}>{event.dateCertainty === 'approximate' ? <><T value={ui.lifecycle.circa} /> </> : null}{event.eventDate}</time> · {event.eventType}</li>
          ))}</ul>
        </section>
      ) : null}
      {wiki ? (
        <section className="card">
          <h2><T value={ui.countries.code.constitutions.constitutionid.page.aboutThisConstitution} /></h2>
          <ContentTranslationRegion sourceLanguage="auto"><p data-translate-content>{wiki.summary}</p><WikiImages images={wiki.images.filter((image) => image.placement === 'before_body')} /><WikiBody body={wiki.body} /></ContentTranslationRegion>
          <WikiImages images={wiki.images.filter((image) => image.placement !== 'before_body')} />
          <WikiSources sourceUrls={wiki.sourceUrls ?? []} />
        </section>
      ) : null}
      <section>
        <h2><T value={ui.countries.code.constitutions.constitutionid.page.versions} /></h2>
        {versions.length === 0 ? <p><T value={ui.countries.code.constitutions.constitutionid.page.noPublishedVersionsYet} /></p> : (
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
