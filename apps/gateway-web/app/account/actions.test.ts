// @vitest-environment node
// ACCOUNT-1/AUTH-3: Account Guide, Admin Guide, Sprint 60 security invariants.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { cookieJar, form, json } from '../../test/server-boundary';
import * as actions from './actions';

vi.mock('next/headers', () => ({ cookies: vi.fn(), headers: async () => new Headers({ 'x-atlas-client-ip': '192.0.2.5' }) }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
let jar: ReturnType<typeof cookieJar>;
let roles: string[];
let result: unknown;
let status: number;
const requests: { path: string; method: string; body: unknown; bearer: string | null }[] = [];
beforeEach(() => {
  jar = cookieJar({ ca_session: 'account-session' }); roles = ['admin']; result = {}; status = 200; requests.length = 0;
  vi.mocked(cookies).mockResolvedValue(jar as unknown as Awaited<ReturnType<typeof cookies>>);
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = new URL(String(input)).pathname.replace('/api/identity', '');
    if (path === '/me') return json({ id: 'account-owner', email: 'owner@example.test', roles });
    requests.push({ path, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined, bearer: new Headers(init?.headers).get('Authorization') });
    return json(result, status);
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

const adminCommands = [
  { name: 'invite', run: () => actions.inviteUserAction({}, form({ email: 'invited@example.test', role: ['editor', 'reviewer'] })), path: '/users/invites', method: 'POST', body: { email: 'invited@example.test', roles: ['editor', 'reviewer'] }, result: { inviteToken: 'one-use-invite' }, expected: { token: 'one-use-invite' } },
  { name: 'issue password reset', run: () => actions.issueResetAction({}, form({ userId: 'subject' })), path: '/users/subject/password-resets', method: 'POST', body: undefined, result: { resetToken: 'one-use-reset' }, expected: { token: 'one-use-reset' } },
  { name: 'disable account', run: () => actions.disableUserAction(form({ userId: 'subject' })), path: '/users/subject/disable', method: 'POST', body: undefined, redirect: '/admin/users' },
  { name: 'enable account', run: () => actions.enableUserAction(form({ userId: 'subject' })), path: '/users/subject/enable', method: 'POST', body: undefined, redirect: '/admin/users' },
  { name: 'update roles', run: () => actions.updateRolesAction(form({ userId: 'subject', role: ['editor', 'publisher'] })), path: '/users/subject/roles', method: 'PUT', body: { roles: ['editor', 'publisher'] }, redirect: '/admin/users', stepUp: true },
  { name: 'create service token', run: () => actions.createServiceTokenAction({}, form({ name: '  Index worker  ', scopes: ' search:write, audit:write, ' })), path: '/service-tokens', method: 'POST', body: { name: 'Index worker', scopes: ['search:write', 'audit:write'] }, result: { token: 'private-service-token' }, expected: { token: 'private-service-token' }, stepUp: true },
  { name: 'rotate service token', run: () => actions.rotateServiceTokenAction({}, form({ tokenId: 'service-key' })), path: '/service-tokens/service-key/rotate', method: 'POST', body: {}, result: { token: 'replacement-service-token' }, expected: { token: 'replacement-service-token' }, stepUp: true },
  { name: 'revoke service token', run: () => actions.revokeServiceTokenAction(form({ tokenId: 'service-key' })), path: '/service-tokens/service-key', method: 'DELETE', body: undefined, redirect: '/admin/users', stepUp: true },
];

describe('account administration is restricted to administrators', () => {
  for (const command of adminCommands) {
    it(`${command.name} sends the specified command and presents its outcome`, async () => {
      result = command.result ?? {};
      if (command.redirect) await expect(command.run()).rejects.toThrow(`redirect:${command.redirect}`);
      else expect(await command.run()).toEqual(command.expected);
      expect(requests).toEqual([{ path: command.path, method: command.method, body: command.body, bearer: 'Bearer account-session' }]);
    });
    it.each(['viewer', 'editor', 'reviewer', 'publisher'])(`${command.name} rejects a %s before any write`, async role => {
      roles = [role]; await expect(command.run()).rejects.toThrow('redirect:/admin/users?error=forbidden'); expect(requests).toEqual([]);
    });
    it(`${command.name} rejects anonymous submissions`, async () => {
      jar.values.clear(); await expect(command.run()).rejects.toThrow('redirect:/login'); expect(requests).toEqual([]);
    });
    it(`${command.name} does not report success after upstream rejection`, async () => {
      status = 409; result = { code: 'conflict' };
      if (command.redirect) await expect(command.run()).rejects.toThrow('redirect:/admin/users?error=1');
      else expect(await command.run()).toEqual({ error: true });
      expect(requests).toHaveLength(1);
    });
    if (command.stepUp) it(`${command.name} routes stale proof to fresh verification`, async () => {
      status = 403; result = { code: 'step_up_required' };
      await expect(command.run()).rejects.toThrow('redirect:/account/step-up?returnTo=%2Fadmin%2Fusers');
      expect(requests).toHaveLength(1);
    });
  }
  it('defaults invitations to viewer and supports the existing comma-separated role form', async () => {
    result = { inviteToken: 'one-use-invite' };
    await actions.inviteUserAction({}, form({ email: 'invited@example.test' }));
    expect(requests[0].body).toEqual({ email: 'invited@example.test', roles: ['viewer'] });
    await expect(actions.updateRolesAction(form({ userId: 'subject', roles: ' editor, reviewer, ' }))).rejects.toThrow('redirect:/admin/users');
    expect(requests[1].body).toEqual({ roles: ['editor', 'reviewer'] });
  });
});

describe('account and recovery commands preserve confidentiality and failure states', () => {
  it('changes the password with the current bearer and credentials', async () => {
    expect(await actions.changePasswordAction(form({ currentPassword: 'old-password', newPassword: 'new-password' }))).toBe('/account?saved=1');
    expect(requests[0]).toMatchObject({ path: '/password/change', body: { currentPassword: 'old-password', newPassword: 'new-password' }, bearer: 'Bearer account-session' });
    status = 401; expect(await actions.changePasswordAction(form({}))).toBe('/account?error=1');
    jar.values.clear(); expect(await actions.changePasswordAction(form({}))).toBe('/login'); expect(requests).toHaveLength(2);
  });
  it.each(['auto', 'en', 'de'])('saves the supported language %s and invalidates translated layout', async language => {
    expect(await actions.updateLanguagePreferenceAction(form({ languagePreference: language }))).toBe(true);
    expect(requests[0]).toMatchObject({ path: '/me/language', method: 'PUT', body: { languagePreference: language } });
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });
  it('does not write invalid language preferences or invalidate layout after a failed save', async () => {
    expect(await actions.updateLanguagePreferenceAction(form({ languagePreference: 'xx' }))).toBe(false); expect(requests).toEqual([]);
    status = 503; expect(await actions.updateLanguagePreferenceAction(form({ languagePreference: 'de' }))).toBe(false); expect(revalidatePath).not.toHaveBeenCalled();
  });
  it.each([200, 503])('does not disclose whether a reset email exists when Identity returns %s', async code => {
    status = code; await expect(actions.requestResetAction(form({ email: 'unknown@example.test' }))).rejects.toThrow('redirect:/reset?sent=1');
    expect(requests[0]).toMatchObject({ path: '/password/reset', body: { email: 'unknown@example.test' }, bearer: null });
  });
  it('keeps a failed reset separate from completed recovery', async () => {
    await expect(actions.confirmResetAction(form({ token: 'one-use-reset', newPassword: 'new-password' }))).rejects.toThrow('redirect:/login');
    expect(requests[0]).toMatchObject({ path: '/password/reset/confirm', body: { token: 'one-use-reset', newPassword: 'new-password' } });
    status = 400; await expect(actions.confirmResetAction(form({}))).rejects.toThrow('redirect:/reset?error=1');
  });
  it('encodes an invitation token when redisplaying a failed invitation', async () => {
    status = 400; await expect(actions.acceptInviteAction(form({ token: 'invite&other=value', password: 'new-password' }))).rejects.toThrow('redirect:/invite?token=invite%26other%3Dvalue&error=1');
    status = 200; await expect(actions.acceptInviteAction(form({ token: 'invite', password: 'new-password' }))).rejects.toThrow('redirect:/login');
  });
  it('stores enrollment challenges in an HTTP-only cookie rather than a URL', async () => {
    result = { challengeToken: 'password-backed-challenge' }; expect(await actions.startMfaEnrollAction('current-password')).toBe(true);
    expect(requests[0]).toMatchObject({ path: '/mfa/enroll/start', body: { password: 'current-password' } });
    expect(jar.writes[0]).toMatchObject({ name: 'ca_mfa_challenge', value: 'password-backed-challenge', options: { httpOnly: true } });
    status = 401; expect(await actions.startMfaEnrollAction('wrong-password')).toBe(false);
  });
  it.each([
    { name: 'confirm enrollment', run: () => actions.confirmAccountMfaAction({}, form({ code: '123456', challengeToken: 'pending' })), path: '/mfa/enroll/confirm', body: { code: '123456', challengeToken: 'pending' } },
    { name: 'replace recovery codes', run: () => actions.regenerateRecoveryAction({}, form({ code: '123456' })), path: '/mfa/recovery/regenerate', body: { code: '123456' } },
  ])('returns private codes as form state for $name', async command => {
    result = { recoveryCodes: ['private-code-1', 'private-code-2'] }; expect(await command.run()).toEqual(result);
    expect(requests[0]).toMatchObject({ path: command.path, body: command.body });
    status = 401; expect(await command.run()).toEqual({ error: true });
  });
  it('does not redirect to an external origin after step-up', async () => {
    await expect(actions.stepUpAction(form({ code: '123456', returnTo: '//attacker.example' }))).rejects.toThrow('redirect:/account');
    expect(requests[0]).toMatchObject({ path: '/mfa/step-up', body: { code: '123456' } });
    status = 401; await expect(actions.stepUpAction(form({ code: 'wrong', returnTo: '/editor?sessionId=chosen' }))).rejects.toThrow('redirect:/account/step-up?error=1&returnTo=%2Feditor%3FsessionId%3Dchosen');
  });
  it('shows MFA removal failures without claiming success', async () => {
    await expect(actions.revokeMfaAction(form({ code: '123456' }))).rejects.toThrow('redirect:/account?mfaRevoked=1');
    expect(requests[0]).toMatchObject({ path: '/mfa', method: 'DELETE', body: { code: '123456' } });
    status = 403; await expect(actions.revokeMfaAction(form({ code: 'wrong' }))).rejects.toThrow('redirect:/account?error=mfa');
  });
  it.each([false, true])('grants exactly the requested personal-key scope (import %s)', async importing => {
    result = { token: 'private-key' }; expect(await actions.createMcpKeyAction({}, form({ name: 'Research', ...(importing ? { importEnabled: 'on' } : {}) }))).toEqual({ token: 'private-key' });
    expect(requests[0]).toMatchObject({ path: '/mcp-keys', body: { name: 'Research', scopes: importing ? ['mcp:read', 'ingestion:import'] : ['mcp:read'] } });
  });
  it.each(['create', 'rotate'])('handles stale proof and rejection during personal-key %s', async operation => {
    const run = () => operation === 'create' ? actions.createMcpKeyAction({}, form({ name: 'Research' })) : actions.rotateMcpKeyAction({}, form({ keyId: 'key/id' }));
    result = { token: 'replacement-key' }; expect(await run()).toEqual({ token: 'replacement-key' });
    status = 403; result = { code: 'step_up_required' }; await expect(run()).rejects.toThrow('redirect:/account/step-up?returnTo=%2Faccount');
    status = 500; result = {}; expect(await run()).toEqual({ error: true });
  });
  it.each([
    { run: () => actions.revokeMcpKeyAction(form({ keyId: 'key/id' })), path: '/mcp-keys/key%2Fid', error: 'key' },
    { run: () => actions.revokeOAuthGrantAction(form({ clientId: 'client/id' })), path: '/oauth/grants/client%2Fid', error: 'oauth' },
  ])('revokes only the chosen connection and reports rejection', async command => {
    await expect(command.run()).rejects.toThrow('redirect:/account'); expect(requests[0]).toMatchObject({ path: command.path, method: 'DELETE' });
    status = 500; await expect(command.run()).rejects.toThrow(`redirect:/account?error=${command.error}`);
  });
  it('requires sign-in before account preferences or credentials are changed', async () => {
    jar.values.clear(); await expect(actions.createMcpKeyAction({}, form({}))).rejects.toThrow('redirect:/login'); expect(requests).toEqual([]);
  });
});
