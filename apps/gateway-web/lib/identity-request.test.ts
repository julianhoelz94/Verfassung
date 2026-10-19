import { beforeEach, expect, it, vi } from 'vitest';
import { headers } from 'next/headers';
import { identityRequestFetch } from './identity-request';

vi.mock('next/headers', () => ({ headers: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

it('keeps visitor rate-limit identities separate while preserving authentication and cancellation', async () => {
  const upstream = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'));
  const controller = new AbortController();
  vi.mocked(headers).mockResolvedValueOnce(new Headers({ 'x-atlas-client-ip': '198.51.100.1', 'x-forwarded-for': 'forged, 198.51.100.1, 172.22.0.3', 'user-agent': 'Browser A' }));
  vi.mocked(headers).mockResolvedValueOnce(new Headers({ 'x-atlas-client-ip': '198.51.100.2', 'user-agent': 'Browser B' }));
  for (const ip of ['198.51.100.1', '198.51.100.2']) {
    const request = await identityRequestFetch(upstream);
    await request('http://identity/passkeys/login/start', { method: 'POST', headers: { Authorization: 'Bearer test-session', 'X-Forwarded-For': 'forged', 'X-Atlas-Client-IP': 'forged' }, signal: controller.signal });
    const init = upstream.mock.calls.at(-1)![1]!;
    const sent = new Headers(init.headers);
    expect(sent.get('x-forwarded-for')).toBe(ip);
    expect(sent.get('x-atlas-client-ip')).toBe(ip);
    expect(sent.get('authorization')).toBe('Bearer test-session');
    expect(sent.get('user-agent')).toBe(ip.endsWith('.1') ? 'Browser A' : 'Browser B');
    expect(init.signal).toBe(controller.signal);
  }
});

it('ignores raw forwarding headers when the pinned edge identity is absent', async () => {
  const upstream = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'));
  vi.mocked(headers).mockResolvedValue(new Headers({ 'x-forwarded-for': 'forged', 'x-real-ip': 'forged' }));
  const request = await identityRequestFetch(upstream);
  await request(new Request('http://identity/passkeys/login/start', { headers: { 'X-Atlas-Client-IP': 'forged', 'X-Forwarded-For': 'forged' } }));
  const sent = new Headers(upstream.mock.calls[0][1]?.headers);
  expect(sent.has('x-atlas-client-ip')).toBe(false);
  expect(sent.has('x-forwarded-for')).toBe(false);
});
