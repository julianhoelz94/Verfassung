'use client';

import { NavigatingActionForm } from './NavigatingActionForm';

import { T, useTranslation } from './TranslationProvider';
import { ui } from '../../lib/messages';
import { roleMessage } from '../../lib/ui-labels';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
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
  needsReviewCount?: number;
  anonymousBrowsingAllowed?: boolean;
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
  const t = useTranslation();
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
                    <T value={roleMessage(role)} />
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
          {section.heading ? <div className="menu-label">{section.headingMessage ? t(section.headingMessage) : section.heading}</div> : null}
          {section.links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              aria-current={isCurrentNavHref(pathname, link.href) ? 'page' : undefined}
            >
              {link.message ? t(link.message) : link.label}{link.badgeCount ? <Badge tone="changed">{link.badgeCount}</Badge> : null}
            </a>
          ))}
          {section.id === 'account' && user ? (
            <NavigatingActionForm action={logoutAction}>
              <button type="submit"><T value={ui.components.siteheader.signOut} /></button>
            </NavigatingActionForm>
          ) : null}
        </div>
      ))}
    </>
  );
}

export function SiteHeader({ user, identityUnavailable = false, needsReviewCount = 0, anonymousBrowsingAllowed = true }: SiteHeaderProps) {
  const t = useTranslation();
  const pathname = usePathname();
  const links = primaryNavLinks(user, false, anonymousBrowsingAllowed);
  const sections = menuSections(user, false, needsReviewCount, anonymousBrowsingAllowed);
  const versionId = versionIdFromPath(pathname);
  const country = versionId ? countryFromPath(pathname) : undefined;
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            §
          </span>
          <span className="brand-name"><T value={ui.components.siteheader.constitutionAtlas} /></span>
        </Link>
        <nav className="nav-primary" aria-label={t(ui.accessibility.primaryNavigation)}>
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              aria-current={isCurrentNavHref(pathname, link.href) ? 'page' : undefined}
            >
              {link.message ? t(link.message) : link.label}
            </a>
          ))}
        </nav>
        <div className="topbar-actions">
          {(user || anonymousBrowsingAllowed) ? <SiteSearchForm
            id="header-search-inline"
            className="search-inline"
            versionId={versionId}
            country={country}
            submitVisible={false}
            ariaLabel={ui.searchForm.headerSearch}
          /> : null}
          {user ? (
            <MenuDisclosure
              key={pathname}
              label={ui.searchForm.accountMenu}
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
                <T value={ui.components.siteheader.logIn} />{" "}</a>
              <MenuDisclosure key={pathname} className="menu-phone" label={ui.searchForm.menu} trigger={<span aria-hidden="true">☰</span>}>
                <MenuSectionList sections={sections} pathname={pathname} user={user} />
              </MenuDisclosure>
            </>
          )}
        </div>
      </div>
      {(user || anonymousBrowsingAllowed) ? <div className="search-row">
        <SiteSearchForm
          id="header-search-phone"
          versionId={versionId}
          country={country}
          submitVisible
          ariaLabel={ui.searchForm.mobileSearch}
        />
      </div> : null}
      {identityUnavailable ? (
        <p className="muted header-status" role="status">
          <T value={ui.components.siteheader.signInIsTemporarilyUnavailable} />{" "}</p>
      ) : null}
    </header>
  );
}
