import { T } from '../components/TranslationProvider';
import { ui } from '../../lib/messages';
import { ReaderPage } from '../components/layout/templates';
import { PageHeader } from '../components/ui';
import { Stack, Section } from '../components/layout/Layout';
import { requestSwaggerAccessPolicy } from '../../lib/swagger-access';

// Deployment metadata is supplied at container startup, not at image build time.
export const dynamic = 'force-dynamic';

const apiServices = [
  'catalog', 'content', 'amendment', 'identity', 'editor',
  'search', 'ingestion', 'audit', 'document',
] as const;

export default async function AboutPage() {
  const deployedTag = process.env.DEPLOYED_TAG?.trim();
  const swaggerEnabled = (await requestSwaggerAccessPolicy().catch(() => null))?.enabled === true;

  return (
    <ReaderPage width="reading" header={<PageHeader
        title={<T value={ui.attrs.aboutPagePageHeaderTitleAbout} />}
        meta={<T value={ui.attrs.aboutPagePageHeaderMetaHowConstitution} />}
      />}>

      <Stack>
        <p className="lede">
          <T value={ui.about.page.constitutionAtlasIsAPublicReadingSite} />{" "}</p>
        <Section id="version" title={<T value={ui.about.page.deployedVersion} />}>
          <p>{deployedTag ? <code>{deployedTag}</code> : <T value={ui.about.page.versionUnavailable} />}</p>
        </Section>
        <Section id="sources" title={<T value={ui.about.page.sources} />}>
          <p>
            <T value={ui.about.page.everyPublishedVersionRecordsWhereTheText} />{" "}</p>
        </Section>
        <Section id="verification" title={<T value={ui.about.page.verificationLabels} />}>
          <p>
            <T value={ui.about.page.labelsSuchAsOfficialImportedOrDemo} />{" "}</p>
        </Section>
        <Section id="accessibility" title={<T value={ui.about.page.accessibility} />}>
          <p>
            <T value={ui.about.page.theSiteAimsToMeetWcag2} />{" "}</p>
        </Section>
        {swaggerEnabled ? <Section id="api-docs" title={<T value={ui.about.page.apiDocumentation} />}
          description={<T value={ui.about.page.swaggerAvailability} />}>
          <Stack as="ul" gap="related">
            {apiServices.map((service) => (
              <li key={service}>
                <a href={`/api/docs/${service}/swagger-ui/index.html`}>{service}-service — Swagger UI</a>
              </li>
            ))}
          </Stack>
        </Section> : null}
      </Stack>
    </ReaderPage>
  );
}
