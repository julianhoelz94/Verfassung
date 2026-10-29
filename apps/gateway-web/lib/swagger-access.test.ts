import { describe, expect, it, vi } from 'vitest';
import { IdentityApiError } from './identity-client';
import { requestSwaggerAccessPolicy, updateSwaggerAccessPolicy } from './swagger-access';

describe('Swagger access client', () => {
  it('reads the current public policy without caching or credentials', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({ enabled: false })));
    expect(await requestSwaggerAccessPolicy(fetch, 'http://identity')).toEqual({ enabled: false });
    expect(fetch).toHaveBeenCalledWith('http://identity/swagger-access', expect.objectContaining({ cache: 'no-store' }));
    expect(fetch.mock.calls[0][1]?.headers).toBeUndefined();
  });

  it('does not turn malformed settings or unavailable responses into public access', async () => {
    for (const policy of [{}, { enabled: 'true' }, null]) {
      await expect(requestSwaggerAccessPolicy(async () => new Response(JSON.stringify(policy))))
        .rejects.toThrow('Invalid Swagger access settings');
    }
    await expect(requestSwaggerAccessPolicy(async () => new Response(null, { status: 503 })))
      .rejects.toThrow('Swagger access settings unavailable');
  });

  it('preserves step-up errors when saving the admin policy', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ code: 'step_up_required' }), { status: 403 }));
    try {
      await expect(updateSwaggerAccessPolicy('admin-token', { enabled: false }))
        .rejects.toMatchObject({ status: 403, code: 'step_up_required', name: IdentityApiError.name });
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/admin/swagger-access'), expect.objectContaining({
        method: 'PUT', body: '{"enabled":false}', headers: { Authorization: 'Bearer admin-token', 'Content-Type': 'application/json' },
      }));
    } finally {
      fetch.mockRestore();
    }
  });
});
