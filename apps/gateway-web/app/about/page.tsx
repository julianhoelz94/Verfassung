import { T } from '../components/TranslationProvider';
import { ui } from '../../lib/messages';
import { ReaderPage } from '../components/layout/templates';
import { PageHeader } from '../components/ui';
import { Stack, Section } from '../components/layout/Layout';

export default function AboutPage() {
  return (
    <ReaderPage width="reading" header={<PageHeader
        title={<T value={ui.attrs.aboutPagePageHeaderTitleAbout} />}
        meta={<T value={ui.attrs.aboutPagePageHeaderMetaHowConstitution} />}
      />}>

      <Stack>
        <p className="lede">
          <T value={ui.about.page.constitutionAtlasIsAPublicReadingSite} />{" "}</p>
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
      </Stack>
    </ReaderPage>
  );
}
