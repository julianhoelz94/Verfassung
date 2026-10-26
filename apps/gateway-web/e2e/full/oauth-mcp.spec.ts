import { createHash, randomBytes } from 'node:crypto';
import { expect, test } from '../fixtures/consent';

test('account OAuth connects an MCP client with PKCE and permits user revocation', async ({ page, request }) => {
  const base = String(test.info().project.use.baseURL);
  const callback = `${base}/oauth/callback-test`;
  const resource = `${base}/mcp`;
  const clientName = `OAuth journey ${Date.now()}`;
  const registration = await request.post('/oauth/register', { data: { client_name: clientName, redirect_uris: [callback], token_endpoint_auth_method: 'none' } });
  expect(registration.status()).toBe(201);
  const clientId = ((await registration.json()) as { client_id: string }).client_id;
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const query = new URLSearchParams({ client_id: clientId, redirect_uri: callback, resource, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', scope: 'mcp:read', state: 'oauth-journey' });

  const anonymous = await request.post('/mcp', { data: { jsonrpc: '2.0', id: 1, method: 'tools/list' } });
  expect(anonymous.status()).toBe(401);
  expect(anonymous.headers()['www-authenticate']).toContain('resource_metadata=');
  await page.goto(`/oauth/authorize?${query}`);
  await page.getByRole('link', { name: 'Sign in to continue' }).click();
  await page.getByLabel('Email').fill(process.env.CI_REVIEWER_EMAIL ?? 'ci-reviewer@example.local');
  await page.getByLabel('Password').fill(process.env.CI_REVIEWER_PASSWORD ?? 'change-me');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Connect a chat client' })).toBeVisible();
  await expect(page.getByText(clientName)).toBeVisible();
  await page.getByRole('button', { name: 'Allow access' }).click();
  await expect(page).toHaveURL(/\/oauth\/callback-test\?code=/);
  const redirectUrl = new URL(page.url());
  expect(redirectUrl.searchParams.get('state')).toBe('oauth-journey');
  const code = redirectUrl.searchParams.get('code');
  expect(code).toBeTruthy();

  const exchange = await request.post('/oauth/token', { form: { grant_type: 'authorization_code', code: code!, client_id: clientId, redirect_uri: callback, code_verifier: verifier, resource } });
  expect(exchange.status()).toBe(200);
  const token = ((await exchange.json()) as { access_token: string }).access_token;
  const mcpHeaders = { Authorization: `Bearer ${token}`, Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'tools/list', 'Content-Type': 'application/json' };
  const tools = await request.post('/mcp', { headers: mcpHeaders, data: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {} } } } });
  expect(tools.status()).toBe(200);
  expect(await tools.text()).toContain('list_countries');
  const browse = await request.post('/mcp', {
    headers: { ...mcpHeaders, 'Mcp-Method': 'tools/call', 'Mcp-Name': 'list_countries' },
    data: { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_countries', arguments: { limit: 2 }, _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {} } } },
  });
  expect(browse.status()).toBe(200);
  const browseBody = await browse.text();
  expect(browseBody).toContain('countries');
  expect(browseBody).not.toContain('"isError":true');

  await page.goto('/account');
  await expect(page.getByText(clientName)).toBeVisible();
  await page.getByText(clientName).locator('..').getByRole('button', { name: 'Revoke access' }).click();
  await expect(page.getByText(clientName)).toHaveCount(0);
  const revoked = await request.post('/mcp', { headers: mcpHeaders, data: { jsonrpc: '2.0', id: 2, method: 'tools/list' } });
  expect(revoked.status()).toBe(401);
});
