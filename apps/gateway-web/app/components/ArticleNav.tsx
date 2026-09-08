type ArticleNavLink = { href: string; label: string };

export function ArticleNav({
  previous,
  next,
  tocHref,
}: {
  previous?: ArticleNavLink;
  next?: ArticleNavLink;
  tocHref: string;
}) {
  return (
    <nav className="pager article-nav print-hide" aria-label="Article navigation">
      {previous ? <a href={previous.href}>{previous.label}</a> : null}
      <a href={tocHref}>Table of contents</a>
      {next ? <a href={next.href}>{next.label}</a> : null}
    </nav>
  );
}
