import { headers as requestHeaders } from 'next/headers';

/** Carry Caddy's pinned peer through server actions; raw forwarding chains are untrusted. */
export async function identityRequestFetch(upstream: typeof fetch = fetch): Promise<typeof fetch> {
  const incoming = await requestHeaders();
  const ip = incoming.get('x-atlas-client-ip')?.trim();
  const agent = incoming.get('user-agent');
  return (input, init) => {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.delete('X-Atlas-Client-IP');
    headers.delete('X-Forwarded-For');
    if (ip) {
      headers.set('X-Atlas-Client-IP', ip);
      headers.set('X-Forwarded-For', ip);
    }
    if (agent) headers.set('User-Agent', agent);
    return upstream(input, { ...init, headers });
  };
}
