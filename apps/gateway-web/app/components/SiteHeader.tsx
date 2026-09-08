'use client';

import { usePathname } from 'next/navigation';
import { logoutAction } from '../login/actions';
import {
  avatarInitial,
  countryFromPath,
  isCurrentNavHref,
  menuSections,
  primaryNavLinks,
  versionIdFromPath,
  type MenuSection,
  type NavUser,
} from '../../lib/nav';
import { Badge } from './ui';
import { MenuDisclosure } from './MenuDisclosure';
import { SiteSearchForm } from './SiteSearchForm';

type SiteHeaderProps = {
  user: NavUser | null;
  identityUnavailable?: boolean;
};

function MenuSectionList({
  sections,
  pathname,
  user,
}: {
  sections: MenuSection[];
  pathname: string;
  user: NavUser | null;
}) {
  return (
    <>
      {sections.map((section) => (
        <div key={section.id} className={section.phoneOnly ? 'menu-group nav-dup' : 'menu-group'}>
          {section.identity ? (
            <div className="menu-user">
              <div>{section.identity.email}</div>
              <div className="page-meta">
                {section.identity.roles.map((role) => (
                  <Badge key={role} tone="accent">
                    {role}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
          {section.heading ? <div className="menu-label">{section.heading}</div> : null}
          {section.links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              aria-current={isCurrentNavHref(pathname, link.href) ? 'page' : undefined}
            >
              {link.label}
            </a>
          ))}
          {section.id === 'account' && user ? (
            <form action={logoutAction}>
              <button type="submit">Sign out</button>
            </form>
          ) : null}
        </div>
      ))}
    </>
  );
}

export function SiteHeader({ user, identityUnavailable = false }: SiteHeaderProps) {
  const pathname = usePathname();
  const links = primaryNavLinks(user);
  const sections = menuSections(user);
  const versionId = versionIdFromPath(pathname);
  const country = versionId ? countryFromPath(pathname) : undefined;
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <a className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            §
          </span>
          <span className="brand-name">Constitution Atlas</span>
        </a>
        <nav className="nav-primary" aria-label="Primary">
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
        <div className="topbar-actions">
          <SiteSearchForm
            id="header-search-inline"
            className="search-inline"
            versionId={versionId}
            country={country}
            submitVisible={false}
            ariaLabel="Header search"
          />
          {user ? (
            <MenuDisclosure
              key={pathname}
              label="Account menu"
              trigger={
                <>
                  <span className="menu-trigger-phone" aria-hidden="true">
                    ☰
                  </span>
                  <span className="avatar menu-trigger-desktop">{avatarInitial(user.email)}</span>
                </>
              }
            >
              <MenuSectionList sections={sections} pathname={pathname} user={user} />
            </MenuDisclosure>
          ) : (
            <>
              <a className="btn btn-sm login-desktop" href="/login">
                Log in
              </a>
              <MenuDisclosure key={pathname} className="menu-phone" label="Menu" trigger={<span aria-hidden="true">☰</span>}>
                <MenuSectionList sections={sections} pathname={pathname} user={user} />
              </MenuDisclosure>
            </>
          )}
        </div>
      </div>
      <div className="search-row">
        <SiteSearchForm
          id="header-search-phone"
          versionId={versionId}
          country={country}
          submitVisible
          ariaLabel="Mobile search"
        />
      </div>
      {identityUnavailable ? (
        <p className="muted header-status" role="status">
          Sign-in is temporarily unavailable.
        </p>
      ) : null}
    </header>
  );
}
