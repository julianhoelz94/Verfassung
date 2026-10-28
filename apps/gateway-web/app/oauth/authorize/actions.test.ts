// AUTH-3: registered OAuth redirect/resource binding and explicit user consent.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requireSessionBearer } from '../../../lib/session';
import { form, json } from '../../../test/server-boundary';
import { authorizeClient } from './actions';
vi.mock('../../../lib/session', () => ({ requireSessionBearer: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
const values = { client_id: 'research/client', redirect_uri: 'https://client.example/callback', resource: 'https://atlas.example/mcp', response_type: 'code', code_challenge: 'pkce-sha256', code_challenge_method: 'S256', scope: 'mcp:read', state: 'request&state' };
let approvalStatus = 200;
beforeEach(() => {
  approvalStatus = 200; vi.mocked(requireSessionBearer).mockResolvedValue('Bearer browser-session');
  vi.spyOn(globalThis, 'fetch').mockImplementation(async input => String(input).includes('/oauth/clients/') ? json({ clientName: 'Research client' }) : json({ redirect_uri: 'https://client.example/callback?code=one-use-code&state=request%26state' }, approvalStatus));
});
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });
describe('OAuth consent', () => {
  it('verifies the registered client, redirect and resource before approving the exact request', async () => {
    await expect(authorizeClient(form({ ...values, decision: 'approve' }))).rejects.toThrow('redirect:https://client.example/callback?code=one-use-code');
    const [lookup, approved] = vi.mocked(fetch).mock.calls;
    expect(new URL(String(lookup[0])).pathname).toBe('/api/identity/oauth/clients/research%2Fclient'); expect(Object.fromEntries(new URL(String(lookup[0])).searchParams)).toEqual({ redirect_uri: values.redirect_uri, resource: values.resource });
    expect(approved[1]).toMatchObject({ method: 'POST', headers: { Authorization: 'Bearer browser-session' } }); expect(JSON.parse(String(approved[1]?.body))).toEqual(values);
  });
  it('returns denial and state to a registered client without minting an authorization', async () => {
    await expect(authorizeClient(form({ ...values, decision: 'deny' }))).rejects.toThrow('redirect:https://client.example/callback?error=access_denied&state=request%26state'); expect(fetch).toHaveBeenCalledTimes(1); expect(requireSessionBearer).not.toHaveBeenCalled();
  });
  it('never redirects to an unregistered client callback', async () => {
    vi.mocked(fetch).mockResolvedValue(json({}, 400)); await expect(authorizeClient(form({ ...values, redirect_uri: 'https://foreign.example/callback', decision: 'deny' }))).rejects.toThrow('redirect:/account?oauth=invalid'); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('requires an explicit approval decision', async () => {
    await expect(authorizeClient(form({ ...values, decision: 'automatic' }))).rejects.toThrow('redirect:/account?oauth=invalid'); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('requires a browser session before granting consent', async () => {
    vi.mocked(requireSessionBearer).mockRejectedValue(new Error('sign-in required')); await expect(authorizeClient(form({ ...values, decision: 'approve' }))).rejects.toThrow('sign-in required'); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('requires fresh proof for import scope without losing the PKCE request', async () => {
    approvalStatus = 403; await expect(authorizeClient(form({ ...values, scope: 'mcp:read ingestion:import', decision: 'approve' }))).rejects.toThrow('redirect:/account/step-up?returnTo=');
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body))).toMatchObject({ code_challenge: 'pkce-sha256', code_challenge_method: 'S256' });
  });
  it('keeps a rejected read-only approval on the consent page instead of claiming connection', async () => {
    approvalStatus = 403; await expect(authorizeClient(form({ ...values, decision: 'approve' }))).rejects.toThrow('error=permission'); expect(fetch).toHaveBeenCalledTimes(2);
  });
});
