import { isIP } from 'node:net';
import { expect, test } from '../fixtures/consent';
import { signIn, signOut } from './auth';

test.use({ trace: 'off' });

test('an existing passkey protects password login and confirms the current session', async ({ page, context }) => {
  test.setTimeout(120_000);
  expect(isIP(new URL(String(test.info().project.use.baseURL)).hostname), 'WebAuthn requires a DNS hostname; use localhost for the test stack').toBe(0);
  const email = `passkey-security-${Date.now()}@example.local`;
  const password = 'A unique device secret 2026!';
  await signIn(page, 'admin');
  const admin = (await context.cookies()).find(cookie => cookie.name === 'ca_session')!.value;
  const invitation = await page.request.post('/api/identity/users/invites', {
    headers: { Authorization: `Bearer ${admin}` }, data: { email, roles: ['viewer'] },
  });
  expect(invitation.status()).toBe(201);
  const { inviteToken } = await invitation.json();
  await signOut(page);
  const activation = await page.request.post('/api/identity/invites/accept', { data: { token: inviteToken, password } });
  expect(activation.ok()).toBeTruthy();
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);

  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: {
    protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true,
    isUserVerified: true, automaticPresenceSimulation: true,
  } });
  try {
    await page.goto('/account');
    await page.locator('#passkey-password').fill(password);
    const addPasskey = page.getByRole('button', { name: 'Add passkey', exact: true });
    await expect(addPasskey).toBeEnabled();
    await page.locator('#passkey-name').fill('Security test device');
    await addPasskey.click();
    await expect(page.locator('[aria-labelledby="passkeys-title"]').getByRole('status')).toHaveText('Passkey added.');
    await page.reload();
    await expect(page.locator('[aria-labelledby="passkeys-title"] li').filter({ hasText: 'Security test device' })).toBeVisible();

    const before = (await context.cookies()).find(cookie => cookie.name === 'ca_session')!.value;
    await page.goto('/account/step-up?returnTo=%2Faccount%3Fverified%3D1');
    await page.getByRole('button', { name: 'Use a passkey', exact: true }).click();
    await expect(page).toHaveURL(/\/account\?verified=1$/);
    const after = (await context.cookies()).find(cookie => cookie.name === 'ca_session')!.value;
    expect(after).toBe(before);
    const me = await page.request.get('/api/identity/me', { headers: { Authorization: `Bearer ${after}` } });
    expect((await me.json()).stepUpFresh).toBe(true);

    const registered = await page.request.post('/oauth/register', { data: {
      client_name: 'Passkey consent test', redirect_uris: ['http://127.0.0.1:47003/callback'],
    } });
    expect(registered.status()).toBe(201);
    const { client_id: clientId } = await registered.json();
    const query = new URLSearchParams({ client_id: clientId, redirect_uri: 'http://127.0.0.1:47003/callback',
      resource: new URL('/mcp', page.url()).href, response_type: 'code', code_challenge: 'a'.repeat(43),
      code_challenge_method: 'S256', scope: 'mcp:read', state: 'passkey-security' });
    const destination = `/oauth/authorize?${query}`;
    await signOut(page);
    await page.goto(`/login?next=${encodeURIComponent(destination)}`);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/login\/mfa\?/);
    await expect(page.getByRole('button', { name: 'Set up a passkey instead', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Use a passkey', exact: true }).click();
    await expect(page).toHaveURL(/\/oauth\/authorize\?/);
    await expect(page.getByRole('button', { name: 'Allow access', exact: true })).toBeEnabled();
    expect(new URL(page.url()).searchParams.get('state')).toBe('passkey-security');
  } finally {
    await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
  }
});
