export type NavUser = {
  email: string;
  roles: string[];
};

export type NavLink = {
  href: string;
  label: string;
};

const PUBLIC_LINKS: NavLink[] = [
  { href: '/', label: 'Countries' },
  { href: '/search', label: 'Search' },
];

export function canVisitEditor(roles: string[]): boolean {
  return roles.includes('admin') || roles.includes('editor') || roles.includes('reviewer') || roles.includes('publisher');
}

export function canVisitAdmin(roles: string[]): boolean {
  return roles.includes('admin');
}

export function canVisitApiDocs(roles: string[]): boolean {
  return roles.includes('admin');
}

export function primaryNavLinks(user: NavUser | null, apiDocsAvailable = false): NavLink[] {
  const links = [...PUBLIC_LINKS];
  if (!user) {
    links.push({ href: '/login', label: 'Log in' });
    return links;
  }
  if (canVisitEditor(user.roles)) {
    links.push({ href: '/editor', label: 'Editor' });
  }
  links.push({ href: '/account', label: 'Account' });
  if (canVisitAdmin(user.roles)) {
    links.push({ href: '/admin/users', label: 'Users' });
    links.push({ href: '/admin/constitutions', label: 'Outlines' });
  }
  if (apiDocsAvailable && canVisitApiDocs(user.roles)) {
    links.push({ href: '/api-docs', label: 'API docs' });
  }
  return links;
}

export function isCurrentNavHref(pathname: string, href: string): boolean {
  if (href === '/') {
    return pathname === '/';
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
