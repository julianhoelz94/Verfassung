import { ui, type UiMessage } from './messages';

export type NavUser = {
  email: string;
  roles: string[];
};

export type NavLink = {
  href: string;
  label: string;
  message?: UiMessage;
  badgeCount?: number;
};

export type MenuSection = {
  id: 'identity' | 'primary' | 'editorial' | 'admin' | 'account';
  heading?: string;
  headingMessage?: UiMessage;
  phoneOnly?: boolean;
  identity?: { email: string; roles: string[] };
  links: NavLink[];
};

const PUBLIC_LINKS: NavLink[] = [
  { href: '/', label: 'Countries', message: ui.nav.countries },
  { href: '/search', label: 'Search', message: ui.nav.search },
  { href: '/about', label: 'About', message: ui.nav.about },
];

export function canVisitEditor(roles: string[]): boolean {
  return roles.includes('admin') || roles.includes('editor') || roles.includes('reviewer') || roles.includes('publisher');
}

export function canVisitAdmin(roles: string[]): boolean {
  return roles.includes('admin');
}

export function canVisitApiDocs(roles: string[]): boolean {
  return canVisitAdmin(roles);
}

export function primaryNavLinks(user: NavUser | null, apiDocsAvailable = false, anonymousBrowsingAllowed = true): NavLink[] {
  const links = user || anonymousBrowsingAllowed ? [...PUBLIC_LINKS] : PUBLIC_LINKS.filter((link) => link.href === '/about');
  if (!user) {
    return links;
  }
  if (canVisitEditor(user.roles)) {
    links.push({ href: '/editor', label: 'Editor', message: ui.nav.editor });
  }
  if (canVisitAdmin(user.roles)) {
    links.push({ href: '/admin', label: 'Admin', message: ui.nav.admin });
  }
  if (apiDocsAvailable && canVisitApiDocs(user.roles)) {
    links.push({ href: '/api-docs', label: 'API docs', message: ui.nav.apiDocs });
  }
  return links;
}

export function editorialLinks(roles: string[], needsReviewCount = 0): NavLink[] {
  const links: NavLink[] = [];
  const isAdmin = roles.includes('admin');
  const isEditor = isAdmin || roles.includes('editor');
  const isReviewer = isAdmin || roles.includes('reviewer');
  const isPublisher = isAdmin || roles.includes('publisher');
  if (isEditor) {
    links.push({ href: '/editor?mine=1', label: 'My sessions', message: ui.nav.mySessions });
  }
  if (isEditor || isReviewer) {
    links.push({ href: '/editor?status=reviewing', label: 'Review queue', message: ui.nav.reviewQueue });
  }
  if (isPublisher) {
    links.push({ href: '/editor?status=approved', label: 'Ready to publish', message: ui.nav.readyToPublish });
  }
  if (isEditor || isReviewer || isPublisher) {
    links.push({ href: '/editor/documents', label: 'Documents', message: ui.nav.documents });
    links.push({ href: '/editor/amendments', label: 'Legal changes', message: ui.nav.legalChanges, badgeCount: needsReviewCount || undefined });
    links.push({ href: '/editor/history', label: 'Snapshot history', message: ui.nav.snapshotHistory });
  }
  return links;
}

export function adminLinks(): NavLink[] {
  return [
    { href: '/admin/users', label: 'Users', message: ui.nav.users },
    { href: '/admin/anonymous-browsing', label: 'Anonymous browsing', message: ui.nav.anonymousBrowsing },
    { href: '/admin/constitutions', label: 'Outlines', message: ui.nav.outlines },
    { href: '/admin/import', label: 'Import', message: ui.nav.import },
  ];
}

export function menuSections(user: NavUser | null, apiDocsAvailable = false, needsReviewCount = 0, anonymousBrowsingAllowed = true): MenuSection[] {
  const sections: MenuSection[] = [];
  if (user) {
    sections.push({
      id: 'identity',
      identity: { email: user.email, roles: user.roles },
      links: [],
    });
  }
  const barLinks = primaryNavLinks(user, apiDocsAvailable, anonymousBrowsingAllowed).filter((link) => link.href !== '/api-docs');
  sections.push({
    id: 'primary',
    heading: 'Navigate', headingMessage: ui.nav.navigate,
    phoneOnly: true,
    links: barLinks,
  });
  if (user && canVisitEditor(user.roles)) {
    sections.push({
      id: 'editorial',
      heading: 'Editorial', headingMessage: ui.nav.editorial,
      links: editorialLinks(user.roles, needsReviewCount),
    });
  }
  if (user && canVisitAdmin(user.roles)) {
    const links = [...adminLinks()];
    if (apiDocsAvailable) {
      links.push({ href: '/api-docs', label: 'API docs', message: ui.nav.apiDocs });
    }
    sections.push({
      id: 'admin',
      heading: 'Admin', headingMessage: ui.nav.admin,
      links,
    });
  }
  if (user) {
    sections.push({
      id: 'account',
      heading: 'Account', headingMessage: ui.nav.account,
      links: [{ href: '/account', label: 'Account', message: ui.nav.account }, { href: '/account#mcp-keys', label: 'MCP keys', message: ui.nav.mcpKeys }],
    });
  } else {
    sections.push({
      id: 'account',
      links: [{ href: '/login', label: 'Log in', message: ui.nav.logIn }],
    });
  }
  return sections.filter((section) => section.identity || section.links.length > 0);
}

export function isCurrentNavHref(pathname: string, href: string): boolean {
  const path = href.split('?')[0] ?? href;
  if (path === '/') {
    return pathname === '/';
  }
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function versionIdFromPath(pathname: string): string | undefined {
  const match = pathname.match(
    /\/versions\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
  );
  return match?.[1];
}

export function countryFromPath(pathname: string): string | undefined {
  const match = pathname.match(/^\/countries\/([A-Za-z]{2})(?:\/|$)/);
  return match?.[1]?.toUpperCase();
}

export function avatarInitial(email: string): string {
  const trimmed = email.trim();
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : '?';
}
