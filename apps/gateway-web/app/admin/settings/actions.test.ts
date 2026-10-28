// ACCOUNT-1: Admin Guide, setup mail deferral and explicit translation-provider consent.
// Real adapters execute against the HTTP boundary; configured secrets are never read back.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cookies } from 'next/headers';
import { cookieJar, form, json } from '../../../test/server-boundary';
import * as actions from './actions';
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
const current = { selfRegistrationEnabled: true, mailEnabled: true, mailFrom: 'atlas@example.test', mailFromName: 'Atlas', mailPublicBaseUrl: 'https://atlas.example', smtpHost: 'smtp.example.test', smtpPort: 587, smtpUsername: 'mailer', smtpPasswordSet: true, smtpAuth: true, smtpStarttls: true, smtpSsl: false };
const writes: { path: string; body: Record<string, unknown> }[] = [];
let status = 200; let code = ''; let roles: string[] = ['admin'];
beforeEach(() => {
  writes.length = 0; status = 200; code = ''; roles = ['admin'];
  vi.mocked(cookies).mockResolvedValue(cookieJar({ ca_session: 'admin-session' }) as unknown as Awaited<ReturnType<typeof cookies>>);
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = new URL(String(input)).pathname; if (init?.method && init.method !== 'GET') writes.push({ path, body: JSON.parse(String(init.body)) });
    if (path.endsWith('/me') && !path.includes('/content-translation/')) return json({ id: 'staff', email: 'staff@example.test', roles });
    if (status !== 200) return json({ code }, status);
    if (path.endsWith('/setup')) return json({ preferences: { mailDeferred: false, enabledLanguages: ['en'], defaultLanguage: 'en' } });
    return json(current);
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });
describe('administrative settings commands', () => {
  for (const [name, command] of [
    ['save mail', () => actions.saveIdentitySettingsAction(form({}))],
    ['send test mail', () => actions.sendTestMailAction(form({ to: 'recipient@example.test' }))],
    ['save translation', () => actions.saveContentTranslationSettingsAction(form({ provider: 'google' }))],
  ] as const) {
    it.each(['viewer', 'editor', 'reviewer', 'publisher'])(`denies %s attempting to ${name} before any settings write`, async role => {
      roles = [role]; await expect(command()).rejects.toThrow('redirect:/admin/settings?error=forbidden'); expect(writes).toEqual([]);
    });
  }
  it('requires sign-in before changing administrative settings', async () => {
    vi.mocked(cookies).mockResolvedValue(cookieJar() as unknown as Awaited<ReturnType<typeof cookies>>); await expect(actions.saveIdentitySettingsAction(form({}))).rejects.toThrow('redirect:/login'); expect(writes).toEqual([]);
  });
  it('keeps registration disabled when outgoing mail is disabled', async () => {
    expect(await actions.saveIdentitySettingsAction(form({ selfRegistrationEnabled: 'on' }))).toBe('/admin/settings?saved=1');
    expect(writes[0].body).toMatchObject({ mailEnabled: false, selfRegistrationEnabled: false, smtpHost: 'smtp.example.test' }); expect(writes[0].body).not.toHaveProperty('smtpPasswordSet'); expect(writes[0].body).not.toHaveProperty('smtpPassword');
  });
  it('sends explicitly edited mail settings and keeps blank passwords as an unchanged-secret request', async () => {
    await actions.saveIdentitySettingsAction(form({ mailEnabled: 'on', selfRegistrationEnabled: 'on', smtpHost: 'new-smtp.example.test', smtpPort: '465', smtpSsl: 'on', smtpPassword: '' }));
    expect(writes[0].body).toMatchObject({ mailEnabled: true, selfRegistrationEnabled: true, smtpHost: 'new-smtp.example.test', smtpPort: 465, smtpSsl: true, smtpStarttls: false, smtpPassword: '' });
  });
  it('persists explicit mail deferral separately from SMTP configuration', async () => {
    expect(await actions.saveIdentitySettingsAction(form({ returnTo: '/setup', hasMailDeferredPreference: '1', mailDeferred: 'on', mailEnabled: 'on' }))).toBe('/setup?saved=1');
    expect(writes[0].body).toMatchObject({ mailEnabled: false, selfRegistrationEnabled: false }); expect(writes[1]).toMatchObject({ path: '/api/identity/setup', body: { mailDeferred: true, enabledLanguages: ['en'] } });
  });
  it.each([['save', 'save'], ['test', 'test']])('does not report a failed mail %s as successful', async (operation, error) => {
    status = 503; const result = operation === 'save' ? await actions.saveIdentitySettingsAction(form({})) : await actions.sendTestMailAction(form({ to: 'recipient@example.test' })); expect(result).toBe(`/admin/settings?error=${error}`);
  });
  it('sends a test only to the selected address and returns only an allowed local settings path', async () => {
    expect(await actions.sendTestMailAction(form({ to: 'recipient@example.test', returnTo: 'https://foreign.example' }))).toBe('/admin/settings?tested=1'); expect(writes[0]).toEqual({ path: '/api/identity/admin/settings/test-mail', body: { to: 'recipient@example.test' } });
  });
  it.each(['mail', 'test', 'translation'])('routes stale proof to verification for %s', async operation => {
    status = 403; code = 'step_up_required'; const data = form({ returnTo: '/setup' });
    const result = operation === 'mail' ? await actions.saveIdentitySettingsAction(data) : operation === 'test' ? await actions.sendTestMailAction(data) : await actions.saveContentTranslationSettingsAction(data);
    expect(result).toBe(`/account/step-up?returnTo=${operation === 'translation' ? '%2Fadmin%2Fsettings' : '%2Fsetup'}`);
  });
  it('saves a provider and explicit secret-clear instruction without exposing the secret in a destination', async () => {
    const result = await actions.saveContentTranslationSettingsAction(form({ provider: 'google', sharedApiKey: 'private-api-key', clearSharedApiKey: 'on' })); expect(result).toBe('/admin/settings?saved=translation');
    expect(writes[0]).toEqual({ path: '/api/identity/content-translation/admin', body: { provider: 'google', sharedApiKey: 'private-api-key', clearSharedApiKey: true } });
    status = 500; expect(await actions.saveContentTranslationSettingsAction(form({}))).toBe('/admin/settings?error=translation');
  });
});
