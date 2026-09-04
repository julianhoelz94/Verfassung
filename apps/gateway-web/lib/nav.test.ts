import { describe, expect, it } from 'vitest';
import { isCurrentNavHref, primaryNavLinks } from './nav';

describe('primaryNavLinks', () => {
  it('shows public destinations and login for anonymous visitors', () => {
    expect(primaryNavLinks(null).map((link) => link.href)).toEqual(['/', '/search', '/login']);
    expect(primaryNavLinks(null).some((link) => link.href === '/editor')).toBe(false);
    expect(primaryNavLinks(null, true).some((link) => link.href === '/api-docs')).toBe(false);
  });

  it('keeps public links and omits Editor for a signed-in viewer', () => {
    const links = primaryNavLinks({ email: 'viewer@example.local', roles: ['viewer'] });
    expect(links.map((link) => link.href)).toEqual(['/', '/search']);
  });

  it('shows Editor for editor, reviewer, and publisher', () => {
    for (const role of ['editor', 'reviewer', 'publisher']) {
      expect(primaryNavLinks({ email: `${role}@example.local`, roles: [role] }).map((link) => link.href)).toEqual([
        '/',
        '/search',
        '/editor',
      ]);
    }
  });

  it('shows every privileged destination for admin, including API docs when that page exists', () => {
    const withoutDocs = primaryNavLinks({ email: 'admin@example.local', roles: ['admin'] });
    expect(withoutDocs.map((link) => link.href)).toEqual(['/', '/search', '/editor']);
    const withDocs = primaryNavLinks({ email: 'admin@example.local', roles: ['admin'] }, true);
    expect(withDocs.map((link) => link.href)).toEqual(['/', '/search', '/editor', '/api-docs']);
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
});
