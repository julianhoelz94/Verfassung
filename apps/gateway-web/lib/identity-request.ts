import { headers as requestHeaders } from 'next/headers';

/** Carry Caddy's trusted peer through server actions instead of sharing the gateway's IP budget. */
export async function identityRequestFetch(upstream: typeof fetch = fetch): Promise<typeof fetch> {
  const incoming = await requestHeaders();
  const ip = incoming.get('x-forwarded-for')?.split(',')[0]?.trim() || incoming.get('x-real-ip')?.trim();
  const agent = incoming.get('user-agent');
  return (input, init) => {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (ip) headers.set('X-Forwarded-For', ip);
    if (agent) headers.set('User-Agent', agent);
    return upstream(input, { ...init, headers });
  };
}
