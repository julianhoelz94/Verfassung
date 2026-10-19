import { T } from '../components/TranslationProvider';
import { ui } from '../../lib/messages';
import { PageMain } from '../components/PageMain';
import { PageHeader } from '../components/ui';

export default function AboutPage() {
  return (
    <PageMain>
      <PageHeader
        title={<T value={ui.attrs.aboutPagePageHeaderTitleAbout} />}
        meta={<T value={ui.attrs.aboutPagePageHeaderMetaHowConstitution} />}
      />
      <div className="stack">
        <p className="lede">
          <T value={ui.about.page.constitutionAtlasIsAPublicReadingSite} />{" "}</p>
        <section id="sources">
          <h2><T value={ui.about.page.sources} /></h2>
          <p>
            <T value={ui.about.page.everyPublishedVersionRecordsWhereTheText} />{" "}</p>
        </section>
        <section id="verification">
          <h2><T value={ui.about.page.verificationLabels} /></h2>
          <p>
            <T value={ui.about.page.labelsSuchAsOfficialImportedOrDemo} />{" "}</p>
        </section>
        <section id="accessibility">
          <h2><T value={ui.about.page.accessibility} /></h2>
          <p>
            <T value={ui.about.page.theSiteAimsToMeetWcag2} />{" "}</p>
        </section>
      </div>
    </PageMain>
  );
}
