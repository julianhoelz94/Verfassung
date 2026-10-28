// @vitest-environment node
// AUTH-1/2: Account Guide and Sprint 60 security invariants.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cookies } from 'next/headers';
import { cookieJar, json } from '../test/server-boundary';
import * as session from './session';
import * as passkeys from '../app/passkeys/actions';

vi.mock('next/headers', () => ({ cookies: vi.fn(), headers: async () => new Headers({ 'x-atlas-client-ip': '192.0.2.4' }) }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
const user = { id: 'reader-1', email: 'reader@example.test', roles: ['viewer'] };
let jar: ReturnType<typeof cookieJar>;
let upstream: ReturnType<typeof vi.spyOn<typeof globalThis, 'fetch'>>;
beforeEach(() => {
  jar = cookieJar();
  vi.mocked(cookies).mockResolvedValue(jar as unknown as Awaited<ReturnType<typeof cookies>>);
  upstream = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ token: 'new-session', user, expiresInSeconds: 3600 }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

function expectSessionCookie(secure: boolean, maxAge = 3600) {
  expect(jar.writes.find(write => write.name === 'ca_session')).toEqual({ name: 'ca_session', value: 'new-session', options: { httpOnly: true, sameSite: 'lax', path: '/', secure, maxAge } });
  expect(jar.values.has('ca_mfa_challenge')).toBe(false);
}

describe('session establishment follows Identity verification', () => {
  it.each([['production', undefined, true], ['test', undefined, false], ['production', 'false', false], ['test', 'true', true]] as const)('uses secure cookie policy for %s / %s', async (environment, override, secure) => {
    vi.stubEnv('NODE_ENV', environment); vi.stubEnv('SESSION_COOKIE_SECURE', override);
    jar.values.set('ca_session', 'previous-session'); jar.values.set('ca_mfa_challenge', 'old-challenge');
    expect(await session.login(user.email, 'password')).toEqual({ user });
    expectSessionCookie(secure);
    const options = upstream.mock.calls[0][1]!;
    expect(JSON.parse(String(options.body))).toEqual({ email: user.email, password: 'password' });
    expect(new Headers(options.headers).get('Authorization')).toBe('Bearer previous-session');
  });

  it.each([['mfaRequired', 'challenge'], ['mfaEnrollmentRequired', 'enroll']] as const)('keeps %s separate from an authenticated session', async (flag, outcome) => {
    upstream.mockResolvedValue(json({ user, [flag]: true, challengeToken: 'pending-factor' }));
    expect(await session.login(user.email, 'password')).toEqual({ mfa: outcome });
    expect(jar.values.has('ca_session')).toBe(false);
    expect(jar.writes).toEqual([{ name: 'ca_mfa_challenge', value: 'pending-factor', options: { httpOnly: true, sameSite: 'lax', secure: false, path: '/', maxAge: 300 } }]);
    expect(await session.mfaChallengeToken()).toBe('pending-factor');
  });

  it('does not establish a session for a malformed login success', async () => {
    upstream.mockResolvedValue(json({ user }));
    await expect(session.login(user.email, 'password')).rejects.toThrow('Invalid credentials');
    expect(jar.writes).toEqual([]);
  });

  it('uses the service expiry, with a one-day fallback when absent', async () => {
    upstream.mockResolvedValue(json({ token: 'new-session', user }));
    await session.login(user.email, 'password');
    expectSessionCookie(false, 86400);
  });

  it.each([['123456', undefined], ['', 'one-use-recovery']] as const)('binds second-factor completion to the pending challenge', async (code, recoveryCode) => {
    jar.values.set('ca_mfa_challenge', 'pending-factor');
    expect(await session.completeMfaLogin(code, recoveryCode)).toEqual(user);
    expect(JSON.parse(String(upstream.mock.calls[0][1]?.body))).toEqual({ challengeToken: 'pending-factor', ...(code ? { code } : {}), ...(recoveryCode ? { recoveryCode } : {}) });
    expectSessionCookie(false);
  });

  it('rejects an expired challenge before sending credentials upstream', async () => {
    await expect(session.completeMfaLogin('123456')).rejects.toThrow('expired');
    expect(upstream).not.toHaveBeenCalled(); expect(jar.writes).toEqual([]);
  });

  it('keeps a rejected second-factor attempt unauthenticated', async () => {
    jar.values.set('ca_mfa_challenge', 'pending-factor'); upstream.mockResolvedValue(json({ code: 'invalid_code' }, 401));
    await expect(session.completeMfaLogin('wrong')).rejects.toThrow();
    expect(jar.values.has('ca_session')).toBe(false); expect(jar.writes).toEqual([]);
  });

  it('rejects a second-factor response without a session token', async () => {
    jar.values.set('ca_mfa_challenge', 'pending-factor'); upstream.mockResolvedValue(json({ user }));
    await expect(session.completeMfaLogin('123456')).rejects.toThrow(); expect(jar.writes).toEqual([]);
  });

  it('establishes a session only after passkey verification succeeds', async () => {
    jar.values.set('ca_mfa_challenge', 'old-factor');
    expect(await session.completePasskeyLogin('webauthn-challenge', { id: 'credential' })).toEqual(user);
    expect(JSON.parse(String(upstream.mock.calls[0][1]?.body))).toEqual({ challengeId: 'webauthn-challenge', credential: { id: 'credential' } });
    expectSessionCookie(false);
  });

  it('binds first passkey enrollment to the password-backed login challenge', async () => {
    jar.values.set('ca_mfa_challenge', 'password-proof');
    expect(await session.completePasskeyLoginEnrollment('webauthn-challenge', { id: 'credential' })).toEqual(user);
    expect(JSON.parse(String(upstream.mock.calls[0][1]?.body))).toEqual({ challengeToken: 'password-proof', challengeId: 'webauthn-challenge', credential: { id: 'credential' }, label: 'Passkey' });
    expectSessionCookie(false);
  });

  it('cannot enroll a login passkey after the password challenge expires', async () => {
    await expect(session.completePasskeyLoginEnrollment('challenge', {})).rejects.toThrow('expired');
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each(['login', 'enroll'])('rejects passkey %s responses without a session token', async kind => {
    jar.values.set('ca_mfa_challenge', 'password-proof'); upstream.mockResolvedValue(json({ user }));
    const result = kind === 'login' ? session.completePasskeyLogin('challenge', {}) : session.completePasskeyLoginEnrollment('challenge', {});
    await expect(result).rejects.toThrow('Invalid passkey response'); expect(jar.writes).toEqual([]);
  });

  it('returns recovery codes as state after login enrollment, never in a redirect', async () => {
    jar.values.set('ca_mfa_challenge', 'password-proof'); upstream.mockResolvedValue(json({ token: 'new-session', user, recoveryCodes: ['private-code'], expiresInSeconds: 3600 }));
    expect(await session.confirmMfaEnrollment('123456')).toEqual({ user, recoveryCodes: ['private-code'] }); expectSessionCookie(false);
  });

  it('keeps an existing session when account enrollment does not return a replacement', async () => {
    jar.values.set('ca_session', 'current-session'); upstream.mockResolvedValue(json({ recoveryCodes: ['private-code'] }));
    expect((await session.confirmMfaEnrollment('123456')).recoveryCodes).toEqual(['private-code']);
    expect(jar.values.get('ca_session')).toBe('current-session'); expect(jar.writes).toEqual([]);
  });

  it('does not report anonymous enrollment as authenticated without an Identity user', async () => {
    upstream.mockResolvedValue(json({ recoveryCodes: [] }));
    await expect(session.confirmMfaEnrollment('123456')).rejects.toThrow(); expect(jar.writes).toEqual([]);
  });
});

describe('session reads and revocation', () => {
  it('does not call Identity for an anonymous visitor', async () => {
    expect(await session.currentSession()).toEqual({ user: null, identityUnavailable: false }); expect(upstream).not.toHaveBeenCalled();
    await expect(session.requireSessionBearer()).rejects.toThrow('redirect:/login');
  });

  it('passes only the session bearer and returns the verified user', async () => {
    jar.values.set('ca_session', 'current-session'); upstream.mockResolvedValue(json(user));
    expect(await session.requireSessionBearer()).toBe('Bearer current-session'); expect(await session.currentUser()).toEqual(user);
    expect(new Headers(upstream.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer current-session');
    expect(upstream.mock.calls[0][1]?.cache).toBe('no-store');
  });

  it('clears an expired or revoked session', async () => {
    jar.values.set('ca_session', 'revoked-session'); upstream.mockResolvedValue(json({}, 401));
    expect(await session.currentSession()).toEqual({ user: null, identityUnavailable: false }); expect(jar.values.has('ca_session')).toBe(false);
  });

  it('still renders signed out when a server-component cookie cannot be deleted', async () => {
    jar.values.set('ca_session', 'revoked-session'); vi.spyOn(jar, 'delete').mockImplementation(() => { throw new Error('read-only cookie store'); }); upstream.mockResolvedValue(json({}, 401));
    expect(await session.currentSession()).toEqual({ user: null, identityUnavailable: false });
  });

  it.each(['network', 'invalid-json', '503'])('preserves the session on an Identity %s failure', async failure => {
    jar.values.set('ca_session', 'valid-session');
    if (failure === 'network') upstream.mockRejectedValue(new Error('offline'));
    else upstream.mockResolvedValue(failure === '503' ? json({}, 503) : new Response('{'));
    expect(await session.currentSession()).toEqual({ user: null, identityUnavailable: true }); expect(jar.values.get('ca_session')).toBe('valid-session');
  });

  it.each([false, true])('logout clears browser credentials even when Identity fails: %s', async offline => {
    jar.values.set('ca_session', 'current-session'); jar.values.set('ca_mfa_challenge', 'pending-factor');
    if (offline) upstream.mockRejectedValue(new Error('offline'));
    await session.logout(); expect(jar.values.size).toBe(0);
  });

  it('anonymous logout also clears a pending login challenge', async () => {
    jar.values.set('ca_mfa_challenge', 'pending-factor'); await session.logout(); expect(jar.values.size).toBe(0); expect(upstream).not.toHaveBeenCalled();
  });
});


// AUTH-3: passkey enrollment, browser login and account-bound step-up are distinct commands.
describe('passkey action contracts', () => {
  const contracts = [
    { name: 'start account enrollment', run: () => passkeys.startPasskeyEnrollment('current-password'), path: '/passkeys/enroll/start', body: { password: 'current-password' }, authenticated: true },
    { name: 'finish account enrollment', run: () => passkeys.finishPasskeyEnrollment('challenge', { id: 'credential' }, 'Laptop'), path: '/passkeys/enroll/finish', body: { challengeId: 'challenge', credential: { id: 'credential' }, label: 'Laptop' }, authenticated: true },
    { name: 'start browser login', run: () => passkeys.startPasskeyLogin(), path: '/passkeys/login/start', body: undefined, authenticated: false },
    { name: 'start account verification', run: () => passkeys.startPasskeyStepUp(), path: '/passkeys/step-up/start', body: undefined, authenticated: true },
    { name: 'finish account verification', run: () => passkeys.finishPasskeyStepUp('challenge', { id: 'credential' }), path: '/passkeys/step-up/finish', body: { challengeId: 'challenge', credential: { id: 'credential' } }, authenticated: true },
    { name: 'revoke chosen passkey', run: () => passkeys.revokePasskey('key/id', 'current-password'), path: '/passkeys/key%2Fid', body: { password: 'current-password' }, authenticated: true },
    { name: 'start password-backed login enrollment', run: () => passkeys.startPasskeyLoginEnrollment(), path: '/passkeys/enroll/login/start', body: { challengeToken: 'password-proof' }, authenticated: false },
  ];
  for (const contract of contracts) it(contract.name, async () => {
    jar.values.set('ca_session', 'account-session'); jar.values.set('ca_mfa_challenge', 'password-proof');
    upstream.mockResolvedValue(json({ challengeId: 'challenge', options: { challenge: 'AQI' } }));
    await contract.run();
    const [input, options] = upstream.mock.calls[0]; expect(new URL(String(input)).pathname).toBe('/api/identity' + contract.path);
    expect(options?.body ? JSON.parse(String(options.body)) : undefined).toEqual(contract.body);
    expect(new Headers(options?.headers).get('Authorization')).toBe(contract.authenticated ? 'Bearer account-session' : null);
    expect(options?.method).toBe(contract.name.startsWith('revoke') ? 'DELETE' : 'POST');
  });
  it('requires a live session before enrolling or verifying an account passkey', async () => {
    await expect(passkeys.startPasskeyEnrollment('password')).rejects.toThrow('Sign in first'); await expect(passkeys.startPasskeyStepUp()).rejects.toThrow('Sign in first'); expect(upstream).not.toHaveBeenCalled();
  });
  it('requires the password-backed challenge before login enrollment starts', async () => {
    await expect(passkeys.startPasskeyLoginEnrollment()).rejects.toThrow('expired'); expect(upstream).not.toHaveBeenCalled();
  });
  it.each(['login', 'enrollment'])('returns only roles to the browser after verified %s', async kind => {
    jar.values.set('ca_mfa_challenge', 'password-proof'); const result = kind === 'login' ? await passkeys.finishPasskeyLogin('challenge', {}) : await passkeys.finishPasskeyLoginEnrollment('challenge', {});
    expect(result).toEqual({ roles: ['viewer'] }); expect(jar.values.get('ca_session')).toBe('new-session'); expect(JSON.stringify(result)).not.toContain('new-session');
  });
});
