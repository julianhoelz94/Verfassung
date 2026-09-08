type SiteFooterProps = {
  showApiDocs?: boolean;
};

export function SiteFooter({ showApiDocs = false }: SiteFooterProps) {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <p>
          Texts are shown as published in our catalog, with source and verification labels.
        </p>
        <nav aria-label="Footer">
          <a href="/about">About</a>
          {' · '}
          <a href="/about#sources">Sources</a>
          {' · '}
          <a href="/about#accessibility">Accessibility</a>
          {showApiDocs ? (
            <>
              {' · '}
              <a href="/api-docs">API docs</a>
            </>
          ) : null}
        </nav>
      </div>
    </footer>
  );
}
