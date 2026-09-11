export type NavUser = {
  email: string;
  roles: string[];
};

export type NavLink = {
  href: string;
  label: string;
};

export type MenuSection = {
  id: 'identity' | 'primary' | 'editorial' | 'admin' | 'account';
  heading?: string;
  phoneOnly?: boolean;
  identity?: { email: string; roles: string[] };
  links: NavLink[];
};

const PUBLIC_LINKS: NavLink[] = [
  { href: '/', label: 'Countries' },
  { href: '/search', label: 'Search' },
  { href: '/about', label: 'About' },
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

export function primaryNavLinks(user: NavUser | null, apiDocsAvailable = false): NavLink[] {
  const links = [...PUBLIC_LINKS];
  if (!user) {
    return links;
  }
  if (canVisitEditor(user.roles)) {
    links.push({ href: '/editor', label: 'Editor' });
  }
  if (canVisitAdmin(user.roles)) {
    links.push({ href: '/admin', label: 'Admin' });
  }
  if (apiDocsAvailable && canVisitApiDocs(user.roles)) {
    links.push({ href: '/api-docs', label: 'API docs' });
  }
  return links;
}

export function editorialLinks(roles: string[]): NavLink[] {
  const links: NavLink[] = [];
  const isAdmin = roles.includes('admin');
  const isEditor = isAdmin || roles.includes('editor');
  const isReviewer = isAdmin || roles.includes('reviewer');
  const isPublisher = isAdmin || roles.includes('publisher');
  if (isEditor) {
    links.push({ href: '/editor?mine=1', label: 'My sessions' });
  }
  if (isEditor || isReviewer) {
    links.push({ href: '/editor?status=reviewing', label: 'Review queue' });
  }
  if (isPublisher) {
    links.push({ href: '/editor?status=approved', label: 'Ready to publish' });
  }
  if (isEditor || isReviewer || isPublisher) {
    links.push({ href: '/editor/amendments', label: 'Amending laws' });
    links.push({ href: '/editor/history', label: 'Snapshot history' });
  }
  return links;
}

export function adminLinks(): NavLink[] {
  return [
    { href: '/admin/users', label: 'Users' },
    { href: '/admin/constitutions', label: 'Outlines' },
    { href: '/admin/import', label: 'Import' },
  ];
}

export function menuSections(user: NavUser | null, apiDocsAvailable = false): MenuSection[] {
  const sections: MenuSection[] = [];
  if (user) {
    sections.push({
      id: 'identity',
      identity: { email: user.email, roles: user.roles },
      links: [],
    });
  }
  const barLinks = primaryNavLinks(user, apiDocsAvailable).filter((link) => link.href !== '/api-docs');
  sections.push({
    id: 'primary',
    heading: 'Navigate',
    phoneOnly: true,
    links: barLinks,
  });
  if (user && canVisitEditor(user.roles)) {
    sections.push({
      id: 'editorial',
      heading: 'Editorial',
      links: editorialLinks(user.roles),
    });
  }
  if (user && canVisitAdmin(user.roles)) {
    const links = [...adminLinks()];
    if (apiDocsAvailable) {
      links.push({ href: '/api-docs', label: 'API docs' });
    }
    sections.push({
      id: 'admin',
      heading: 'Admin',
      links,
    });
  }
  if (user) {
    sections.push({
      id: 'account',
      heading: 'Account',
      links: [{ href: '/account', label: 'Account' }],
    });
  } else {
    sections.push({
      id: 'account',
      links: [{ href: '/login', label: 'Log in' }],
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
