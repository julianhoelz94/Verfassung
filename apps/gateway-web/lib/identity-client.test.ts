import { describe, expect, it } from 'vitest';
import identityMe from './contracts/identity-me.json';
import { requestLogin, requestLogout, requestMe } from './identity-client';

const me = identityMe;

describe('gateway login/logout journey', () => {
  it('logs in, reads /me, then logs out against the identity contract', async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.endsWith('/login') && method === 'POST') {
        calls.push('login');
        const body = JSON.parse(String(init?.body)) as { email: string; password: string };
        expect(body.email).toBe('local-editor@example.local');
        return new Response(JSON.stringify({ token: 'session-token', user: me }), { status: 200 });
      }
      if (url.endsWith('/me')) {
        calls.push('me');
        expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer session-token');
        return new Response(JSON.stringify(me), { status: 200 });
      }
      if (url.endsWith('/logout') && method === 'POST') {
        calls.push('logout');
        expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer session-token');
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected ${method} ${url}`);
    };

    const login = await requestLogin('local-editor@example.local', 'change-me', fetchImpl);
    expect(login.token).toBe('session-token');
    expect(login.user.email).toBe(me.email);
    const user = await requestMe(login.token, fetchImpl);
    expect(user?.roles).toEqual(me.roles);
    await requestLogout(login.token, fetchImpl);
    expect(calls).toEqual(['login', 'me', 'logout']);
  });
});
