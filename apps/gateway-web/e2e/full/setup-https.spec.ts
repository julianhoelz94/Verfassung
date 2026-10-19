import { expect as baseExpect, test } from '../fixtures/consent';
import { signIn } from './auth';

const expect = baseExpect.configure({ timeout: 20_000 });
const enabled = process.env.E2E_TLS_SMOKE === 'true';
const spki = process.env.E2E_TLS_CERT_SPKI;

// Pin only the disposable local CA. Normal browser journeys retain their usual
// certificate checks, and this never changes the host/browser trust store.
test.use({ launchOptions: { args: enabled && spki ? [`--ignore-certificate-errors-spki-list=${spki}`] : [] } });

test('local HTTPS preserves completed setup and protects administrator authentication', async ({ page, context, baseURL }) => {
  test.skip(!enabled, 'Run after recreating the isolated stack in local HTTPS mode.');
  expect(baseURL).toMatch(/^https:\/\/localhost:/);
  expect(spki).toMatch(/^[A-Za-z0-9+/]{43}=$/);
  await page.goto('/login');
  expect(await page.evaluate(async () => (await (await fetch('/api/identity/setup/status')).json()).completed)).toBe(true);
  await signIn(page, 'admin');
  const cookie = (await context.cookies()).find(item => item.name === 'ca_session');
  expect(cookie?.secure).toBe(true);
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe('Lax');
  await page.goto('/setup');
  await expect(page).toHaveURL(/\/admin\/settings$/);
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/settings\?saved=1$/);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Save preferences', exact: true })).toBeVisible();
  expect(await page.evaluate(async () => (await (await fetch('/setup/transport/status')).json()).ready)).toBe(true);
  const httpOrigin = process.env.E2E_HTTP_BASE_URL;
  expect(httpOrigin).toBeTruthy();
  const redirect = await page.request.get(`${httpOrigin}/login`, { maxRedirects: 0 });
  expect(redirect.status()).toBe(303);
  expect(redirect.headers().location).toBe(`${baseURL}/login`);
  const rejected = await page.request.post(`${httpOrigin}/api/identity/login`, { data: { email: 'transport-probe@example.test', password: 'not-a-real-password' }, maxRedirects: 0 });
  expect(rejected.status()).toBe(426);
});
