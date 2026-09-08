import { PageMain } from '../components/PageMain';
import { PageHeader } from '../components/ui';

export default function AboutPage() {
  return (
    <PageMain>
      <PageHeader
        title="About"
        meta="How Constitution Atlas presents texts, sources, and verification."
      />
      <div className="stack">
        <p className="lede">
          Constitution Atlas is a public reading site for versioned constitutions. Each country
          page lists published versions; each version shows the articles as they stood on that
          date, with amendment history and search.
        </p>
        <section id="sources">
          <h2>Sources</h2>
          <p>
            Every published version records where the text came from: an official gazette, a
            government publication, or an imported corpus. Provenance on version and article pages
            names that source so you can check it against the original.
          </p>
        </section>
        <section id="verification">
          <h2>Verification labels</h2>
          <p>
            Labels such as official, imported, or demo describe how the text was checked, not a
            legal opinion. Official means an editor verified the text against a cited source.
            Imported means the text was loaded from a corpus and has not been fully checked.
            Demo is sample data for local development.
          </p>
        </section>
        <section id="accessibility">
          <h2>Accessibility</h2>
          <p>
            The site aims to meet WCAG 2.2 Level AA: skip links, keyboard-complete navigation,
            visible focus, and text that does not rely on colour alone. If something is hard to
            use, that is a defect we want to fix.
          </p>
        </section>
      </div>
    </PageMain>
  );
}
