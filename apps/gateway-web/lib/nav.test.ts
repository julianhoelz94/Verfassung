import { describe, expect, it } from 'vitest';
import {
  avatarInitial,
  countryFromPath,
  isCurrentNavHref,
  menuSections,
  primaryNavLinks,
  versionIdFromPath,
  type NavUser,
} from './nav';

function hrefs(user: NavUser | null, apiDocsAvailable = false): string[] {
  return primaryNavLinks(user, apiDocsAvailable).map((link) => link.href);
}

function sectionIds(user: NavUser | null, apiDocsAvailable = false): string[] {
  return menuSections(user, apiDocsAvailable).map((section) => section.id);
}

function sectionHrefs(user: NavUser | null, id: string, apiDocsAvailable = false): string[] {
  return (menuSections(user, apiDocsAvailable).find((section) => section.id === id)?.links ?? []).map(
    (link) => link.href,
  );
}

describe('primaryNavLinks', () => {
  it('shows public destinations without login for anonymous visitors', () => {
    expect(hrefs(null)).toEqual(['/', '/search', '/about']);
    expect(hrefs(null).includes('/editor')).toBe(false);
    expect(hrefs(null, true).includes('/api-docs')).toBe(false);
  });

  it('keeps public links and omits Editor for a signed-in viewer', () => {
    expect(hrefs({ email: 'viewer@example.local', roles: ['viewer'] })).toEqual(['/', '/search', '/about']);
  });

  it('shows Editor for editor, reviewer, and publisher', () => {
    for (const role of ['editor', 'reviewer', 'publisher']) {
      expect(hrefs({ email: `${role}@example.local`, roles: [role] })).toEqual(['/', '/search', '/about', '/editor']);
    }
  });

  it('shows Editor, Admin, and API docs for admin when that page exists', () => {
    const admin = { email: 'admin@example.local', roles: ['admin'] };
    expect(hrefs(admin)).toEqual(['/', '/search', '/about', '/editor', '/admin']);
    expect(hrefs(admin, true)).toEqual(['/', '/search', '/about', '/editor', '/admin', '/api-docs']);
  });
});

describe('menuSections', () => {
  it('shows phone primary destinations and Log in for anonymous visitors', () => {
    expect(sectionIds(null)).toEqual(['primary', 'account']);
    expect(sectionHrefs(null, 'primary')).toEqual(['/', '/search', '/about']);
    expect(menuSections(null).find((section) => section.id === 'primary')?.phoneOnly).toBe(true);
    expect(sectionHrefs(null, 'account')).toEqual(['/login']);
  });

  it('shows identity, phone primary, and Account for a viewer', () => {
    const viewer = { email: 'viewer@example.local', roles: ['viewer'] };
    expect(sectionIds(viewer)).toEqual(['identity', 'primary', 'account']);
    expect(menuSections(viewer)[0]?.identity).toEqual({ email: viewer.email, roles: viewer.roles });
    expect(sectionHrefs(viewer, 'account')).toEqual(['/account']);
    expect(sectionHrefs(viewer, 'editorial')).toEqual([]);
  });

  it('shows Editorial My sessions and Review queue for an editor', () => {
    const editor = { email: 'editor@example.local', roles: ['editor'] };
    expect(sectionIds(editor)).toEqual(['identity', 'primary', 'editorial', 'account']);
    expect(sectionHrefs(editor, 'editorial')).toEqual(['/editor?mine=1', '/editor?status=reviewing']);
  });

  it('shows only Review queue for a reviewer', () => {
    const reviewer = { email: 'reviewer@example.local', roles: ['reviewer'] };
    expect(sectionHrefs(reviewer, 'editorial')).toEqual(['/editor?status=reviewing']);
  });

  it('shows only Ready to publish for a publisher', () => {
    const publisher = { email: 'publisher@example.local', roles: ['publisher'] };
    expect(sectionHrefs(publisher, 'editorial')).toEqual(['/editor?status=approved']);
  });

  it('unions editorial destinations for combined roles', () => {
    const combined = {
      email: 'combined@example.local',
      roles: ['editor', 'reviewer', 'publisher'],
    };
    expect(sectionHrefs(combined, 'editorial')).toEqual([
      '/editor?mine=1',
      '/editor?status=reviewing',
      '/editor?status=approved',
    ]);
  });

  it('shows editorial, admin, and API docs for admin', () => {
    const admin = { email: 'admin@example.local', roles: ['admin'] };
    expect(sectionIds(admin, true)).toEqual(['identity', 'primary', 'editorial', 'admin', 'account']);
    expect(sectionHrefs(admin, 'editorial', true)).toEqual([
      '/editor?mine=1',
      '/editor?status=reviewing',
      '/editor?status=approved',
    ]);
    expect(sectionHrefs(admin, 'admin', true)).toEqual([
      '/admin/users',
      '/admin/constitutions',
      '/admin/import',
      '/api-docs',
    ]);
    expect(sectionHrefs(admin, 'primary', true)).toEqual(['/', '/search', '/about', '/editor', '/admin']);
  });
});

describe('isCurrentNavHref', () => {
  it('marks only the countries home as current for /', () => {
    expect(isCurrentNavHref('/', '/')).toBe(true);
    expect(isCurrentNavHref('/search', '/')).toBe(false);
  });

  it('marks nested editor routes as current', () => {
    expect(isCurrentNavHref('/editor', '/editor')).toBe(true);
    expect(isCurrentNavHref('/login', '/editor')).toBe(false);
  });

  it('ignores query strings when matching', () => {
    expect(isCurrentNavHref('/editor', '/editor?mine=1')).toBe(true);
  });
});

describe('versionIdFromPath', () => {
  it('reads a version UUID from reader and article paths', () => {
    const id = '01900000-0000-4000-8000-000000000004';
    expect(versionIdFromPath(`/countries/DE/versions/${id}`)).toBe(id);
    expect(versionIdFromPath(`/countries/DE/versions/${id}/articles/01900000-0000-4000-8000-000000000201`)).toBe(id);
    expect(versionIdFromPath('/search')).toBeUndefined();
  });
});

describe('countryFromPath', () => {
  it('reads an ISO code from country, version, and article paths', () => {
    expect(countryFromPath('/countries/DE')).toBe('DE');
    expect(countryFromPath('/countries/de/versions/01900000-0000-4000-8000-000000000004')).toBe('DE');
    expect(countryFromPath('/search')).toBeUndefined();
    expect(countryFromPath('/countries')).toBeUndefined();
  });
});

describe('avatarInitial', () => {
  it('uses the first character of the email', () => {
    expect(avatarInitial('local-editor@example.local')).toBe('L');
    expect(avatarInitial('')).toBe('?');
  });
});
