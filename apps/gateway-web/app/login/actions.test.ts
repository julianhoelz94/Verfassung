// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupStatus } from '../../lib/deployment-setup';
import { IdentityApiError, type SessionUser } from '../../lib/identity-client';
import { completeMfaLogin, confirmMfaEnrollment, login } from '../../lib/session';
import { completeMfaAction, confirmEnrollAction, loginAction } from './actions';

vi.mock('../../lib/session', () => ({ login: vi.fn(), logout: vi.fn(), completeMfaLogin: vi.fn(), confirmMfaEnrollment: vi.fn() }));
vi.mock('../../lib/deployment-setup', () => ({ setupStatus: vi.fn() }));

const user: SessionUser = { id: 'user', email: 'editor@example.test', roles: ['editor'] };
const next = '/editor?sessionId=session-1&versionId=version-1#draft';
function credentials(destination = next) {
  const data = new FormData();
  data.set('email', user.email); data.set('password', 'password'); data.set('next', destination); data.set('code', '123456');
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(setupStatus).mockResolvedValue({ completed: true, tlsMode: 'proxy', publicUrl: 'https://atlas.example' });
  vi.mocked(login).mockResolvedValue({ user });
  vi.mocked(completeMfaLogin).mockResolvedValue(user);
  vi.mocked(confirmMfaEnrollment).mockResolvedValue({ user, recoveryCodes: ['recovery-one'] });
});

describe('authentication destination preservation', () => {
  it('returns to the selected session after password-only sign-in', async () => {
    expect(await loginAction(credentials())).toBe(next);
    expect(login).toHaveBeenCalledWith(user.email, 'password');
  });

  it.each([[401, 'credentials'], [429, 'rate-limit'], [503, 'unavailable']] as const)('keeps the task available after a %s sign-in failure', async (status, error) => {
    vi.mocked(login).mockRejectedValue(new IdentityApiError('failed', status));
    const result = new URL(await loginAction(credentials()), 'https://atlas.example');
    expect(result.pathname).toBe('/login');
    expect(result.searchParams.get('error')).toBe(error);
    expect(result.searchParams.get('next')).toBe(next);
  });

  it.each(['challenge', 'enroll'] as const)('carries intent into MFA %s', async (mfa) => {
    vi.mocked(login).mockResolvedValue({ mfa });
    const result = new URL(await loginAction(credentials()), 'https://atlas.example');
    expect(result.pathname).toBe('/login/mfa');
    expect(result.searchParams.get('next')).toBe(next);
    expect(result.searchParams.get('enroll')).toBe(mfa === 'enroll' ? '1' : null);
  });

  it('preserves the destination while a recovery code is retried and accepted', async () => {
    const form = credentials(); form.set('method', 'recovery'); form.set('recoveryCode', ' recovery-one ');
    vi.mocked(completeMfaLogin).mockRejectedValueOnce(new Error('invalid'));
    const failure = new URL(await completeMfaAction(form), 'https://atlas.example');
    expect(failure.searchParams.get('method')).toBe('recovery');
    expect(failure.searchParams.get('next')).toBe(next);
    expect(await completeMfaAction(form)).toBe(next);
    expect(completeMfaLogin).toHaveBeenLastCalledWith('', 'recovery-one');
  });

  it('shows recovery codes before continuing to the intended page after enrollment', async () => {
    expect(await confirmEnrollAction({}, credentials())).toEqual({ recoveryCodes: ['recovery-one'], continueTo: next });
  });

  it.each(['//evil.example', '/login?next=/editor', '/logout', '/parent/..//evil.example', '/\n/evil.example'])('uses role defaults for a tampered destination: %j', async (destination) => {
    expect(await loginAction(credentials(destination))).toBe('/editor');
    expect(await completeMfaAction(credentials(destination))).toBe('/editor');
    expect((await confirmEnrollAction({}, credentials(destination))).continueTo).toBe('/editor');
  });

  it('retains the viewer default and bootstrap setup gate', async () => {
    vi.mocked(login).mockResolvedValue({ user: { ...user, roles: ['viewer'] } });
    expect(await loginAction(credentials(''))).toBe('/');
    vi.mocked(setupStatus).mockResolvedValue({ completed: false, tlsMode: 'proxy', publicUrl: '' });
    expect(await loginAction(credentials())).toBe('/setup');
    expect(await completeMfaAction(credentials())).toBe('/setup');
    expect((await confirmEnrollAction({}, credentials())).continueTo).toBe('/setup');
  });
});
