// ACCOUNT-1/AUTH-3: Account Guide, consent and secret presentation.
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cookies } from 'next/headers';
import { currentUser, mfaChallengeToken } from '../../lib/session';
import { cookieJar, json } from '../../test/server-boundary';
import Account from './page';
vi.mock('../../lib/session', () => ({ SESSION_COOKIE: 'ca_session', currentUser: vi.fn(), mfaChallengeToken: vi.fn() }));
vi.mock('../../lib/server-locale', () => ({ currentLocale: async () => 'en' }));
vi.mock('../../lib/deployment-setup', () => ({ siteLanguages: async () => ({ enabled: ['en', 'de'], defaultLanguage: 'en' }) }));
vi.mock('next/headers', () => ({ cookies: vi.fn(), headers: async () => new Headers() }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); }, useRouter: () => ({ refresh: vi.fn() }) }));
const upstreamCalls: string[] = [];
beforeEach(() => {
  upstreamCalls.length = 0;
  vi.mocked(currentUser).mockResolvedValue({ id: 'owner', email: 'owner@example.test', roles: ['viewer'], mfaEnabled: false });
  vi.mocked(mfaChallengeToken).mockResolvedValue(undefined);
  vi.mocked(cookies).mockResolvedValue(cookieJar({ ca_session: 'account-session' }) as unknown as Awaited<ReturnType<typeof cookies>>);
  vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const path = new URL(String(input)).pathname; upstreamCalls.push(path);
    if (path.endsWith('/mcp-keys')) return json([{ id: 'research-key', name: 'Research client', scopes: ['mcp:read'], createdAt: '2026-01-01', expiresAt: '2027-01-01', lastUsedAt: null, revokedAt: null }]);
    if (path.endsWith('/oauth/grants')) return json([{ clientId: 'research-app', clientName: 'Research application', redirectUris: [], expiresAt: '2027-01-01' }]);
    if (path.endsWith('/passkeys')) return json([]);
    if (path.endsWith('/content-translation/me')) return json({ alwaysTranslate: false, personalGoogleKeyConfigured: true });
    if (path.endsWith('/mfa/enroll/start')) return json({ secret: 'private-seed', challengeToken: 'private-challenge', qrDataUrl: 'data:image/png;base64,AA==' });
    throw new Error('Unexpected request: ' + path);
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });
const html = async (values: Record<string, string> = {}) => renderToStaticMarkup(await Account({ searchParams: Promise.resolve(values) }));
describe('account security presentation', () => {
  it('requires sign-in and preserves the requested account section', async () => {
    vi.mocked(currentUser).mockResolvedValue(null); await expect(html({ enroll: '1' })).rejects.toThrow('next=%2Faccount%3Fenroll%3D1'); expect(upstreamCalls).toEqual([]);
  });
  it('shows connection identities without revealing existing credentials', async () => {
    const output = await html(); expect(output).toContain('Research client'); expect(output).toContain('Research application'); expect(output).not.toContain('account-session'); expect(output).not.toContain('private-seed'); expect(output).not.toContain('private-challenge');
  });
  it('does not start enrollment from a query parameter without a password-backed challenge', async () => {
    const output = await html({ enroll: '1' }); expect(upstreamCalls).not.toContain('/api/identity/mfa/enroll/start'); expect(output).toContain('role="alert"');
  });
  it('resumes enrollment only with its private pending challenge', async () => {
    vi.mocked(mfaChallengeToken).mockResolvedValue('password-proof'); const output = await html({ enroll: '1' }); expect(upstreamCalls).toContain('/api/identity/mfa/enroll/start'); expect(output).toContain('name="challengeToken"'); expect(output).toContain('Authenticator');
  });
  it('does not offer removing a required authenticator as an ordinary preference', async () => {
    vi.mocked(currentUser).mockResolvedValue({ id: 'publisher', email: 'publisher@example.test', roles: ['publisher'], mfaEnabled: true, mfaRequired: true, stepUpFresh: false });
    const output = await html(); expect(output).not.toContain('id="revokeCode"'); expect(output).toContain('Authenticator');
  });
  it('keeps the account usable when optional connection services fail', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('offline')); const output = await html(); expect(output).toContain('owner@example.test'); expect(output).toContain('name="currentPassword"');
  });
});
