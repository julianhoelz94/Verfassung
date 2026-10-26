import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentUser, mfaChallengeToken } from '../../lib/session';
import { requestStartMfaEnroll } from '../../lib/identity-client';
import { requireAdminPage } from '../../lib/admin';
import LoginPage from './page';
import MfaPage from './mfa/page';

vi.mock('next/navigation', () => ({ redirect: (href: string) => { throw new Error(`redirect:${href}`); }, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('../../lib/session', () => ({ currentUser: vi.fn(), mfaChallengeToken: vi.fn() }));
vi.mock('../../lib/server-locale', () => ({ currentLocale: async () => 'en' }));
vi.mock('../../lib/identity-request', () => ({ identityRequestFetch: async () => vi.fn() }));
vi.mock('../../lib/identity-client', () => ({ requestRegistrationStatus: async () => false, requestStartMfaEnroll: vi.fn() }));
vi.mock('../../lib/deployment-setup', () => ({ setupStatus: async () => ({ completed: true }) }));

const destination = '/editor?sessionId=session-1&versionId=version-1';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(currentUser).mockResolvedValue(null);
  vi.mocked(mfaChallengeToken).mockResolvedValue('challenge');
  vi.mocked(requestStartMfaEnroll).mockResolvedValue({ secret: 'SECRET' });
});

function markupDocument(markup: string) {
  return new DOMParser().parseFromString(markup, 'text/html');
}

describe('login pages carry the intended page', () => {
  it('includes a safe ordinary destination in the password form', async () => {
    const page = await LoginPage({ searchParams: Promise.resolve({ next: destination }) });
    const document = markupDocument(renderToStaticMarkup(page));
    expect(document.querySelector<HTMLInputElement>('input[name=next]')?.value).toBe(destination);
  });

  it.each([{}, { method: 'recovery' }, { enroll: '1' }])('retains the destination in the MFA form: %j', async (params) => {
    const page = await MfaPage({ searchParams: Promise.resolve({ next: destination, ...params }) });
    const document = markupDocument(renderToStaticMarkup(page));
    expect(document.querySelector<HTMLInputElement>('input[name=next]')?.value).toBe(destination);
    if (!params.enroll) {
      const switchLink = document.querySelector<HTMLAnchorElement>('a[href^="/login/mfa"]')!;
      expect(new URL(switchLink.getAttribute('href')!, 'https://atlas.example').searchParams.get('next')).toBe(destination);
    }
  });

  it('keeps intent when the MFA challenge expires and password sign-in must restart', async () => {
    vi.mocked(mfaChallengeToken).mockResolvedValue(undefined);
    await expect(MfaPage({ searchParams: Promise.resolve({ next: destination }) })).rejects.toThrow(`redirect:/login?next=${encodeURIComponent(destination)}`);
  });

  it('returns signed-in visitors to the requested task from login and MFA', async () => {
    vi.mocked(currentUser).mockResolvedValue({ id: 'user', email: 'editor@example.test', roles: ['editor'] });
    await expect(LoginPage({ searchParams: Promise.resolve({ next: destination }) })).rejects.toThrow(`redirect:${destination}`);
    await expect(MfaPage({ searchParams: Promise.resolve({ next: destination }) })).rejects.toThrow(`redirect:${destination}`);
    await expect(LoginPage({ searchParams: Promise.resolve({ next: '/login/mfa' }) })).rejects.toThrow('redirect:/editor');
  });

  it('retains the exact protected administration view and keeps role authorization', async () => {
    await expect(requireAdminPage('/admin/users', { q: 'example', role: 'editor' })).rejects.toThrow(`redirect:/login?next=${encodeURIComponent('/admin/users?q=example&role=editor')}`);
    vi.mocked(currentUser).mockResolvedValue({ id: 'user', email: 'viewer@example.test', roles: ['viewer'] });
    expect(await requireAdminPage('/admin/users')).toBeNull();
  });
});
