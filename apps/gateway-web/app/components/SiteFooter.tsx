import { T, ui } from './TranslationProvider';
import { CookieSettings } from './CookieSettings';

type SiteFooterProps = {
  showApiDocs?: boolean;
};

export function SiteFooter({ showApiDocs = false }: SiteFooterProps) {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <p>
          <T value={ui.components.sitefooter.textsAreShownAsPublishedInOur} />{" "}</p>
        <nav aria-label="Footer">
          <a href="/about"><T value={ui.components.sitefooter.about} /></a>
          {' · '}
          <a href="/about#sources"><T value={ui.components.sitefooter.sources} /></a>
          {' · '}
          <a href="/about#accessibility"><T value={ui.components.sitefooter.accessibility} /></a>
          {' · '}
          <a href="/impressum"><T value={ui.components.sitefooter.impressum} /></a>
          {' · '}
          <a href="/datenschutz"><T value={ui.components.sitefooter.datenschutzerklarung} /></a>
          {' · '}
          <CookieSettings />
          {showApiDocs ? (
            <>
              {' · '}
              <a href="/api-docs"><T value={ui.components.sitefooter.apiDocs} /></a>
            </>
          ) : null}
        </nav>
      </div>
    </footer>
  );
}
