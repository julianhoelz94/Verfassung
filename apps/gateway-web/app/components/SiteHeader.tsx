'use client';

import { usePathname } from 'next/navigation';
import { logoutAction } from '../login/actions';
import { isCurrentNavHref, primaryNavLinks, type NavUser } from '../../lib/nav';

type SiteHeaderProps = {
  user: NavUser | null;
  identityUnavailable?: boolean;
};

export function SiteHeader({ user, identityUnavailable = false }: SiteHeaderProps) {
  const pathname = usePathname();
  const links = primaryNavLinks(user);
  return (
    <header className="site-header">
      <a className="site-brand" href="/">
        Constitution Atlas
      </a>
      <nav className="site-nav" aria-label="Primary">
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            aria-current={isCurrentNavHref(pathname, link.href) ? 'page' : undefined}
          >
            {link.label}
          </a>
        ))}
      </nav>
      <form className="header-search" action="/search" method="get" role="search">
        <input type="search" name="q" placeholder="Search articles" aria-label="Search articles" />
        <button type="submit">Search</button>
      </form>
      <span className="header-spacer" />
      {identityUnavailable ? (
        <p className="muted header-status" role="status">
          Sign-in is temporarily unavailable.
        </p>
      ) : null}
      {user ? (
        <div className="header-account">
          <span className="muted">{user.email}</span>
          <form action={logoutAction}>
            <button type="submit">Sign out</button>
          </form>
        </div>
      ) : null}
    </header>
  );
}
