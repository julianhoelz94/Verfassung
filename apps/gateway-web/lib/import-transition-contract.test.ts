import { afterEach, expect, it, vi } from 'vitest';
import { transitionImportJob } from './ingestion-api';
afterEach(() => vi.unstubAllGlobals());
it.each([401, 403, 409, 500])(
  'preserves known publication errors ahead of HTTP %s fallbacks',
  async (status) => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { code: 'publication_conflict', error: 'Fresh authenticator confirmation required' },
            { status },
          ),
        ),
    );
    await expect(transitionImportJob('job', 'publish', 'Bearer user')).rejects.toMatchObject({
      code: 'publication_conflict',
      message: 'publication_conflict',
    });
  },
);
it.each([
  [401, 'session_expired'],
  [403, 'forbidden'],
  [409, 'conflict'],
  [500, 'unavailable'],
])('handles a non-JSON error response with HTTP %s', async (status, code) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad json', { status: Number(status) })));
  await expect(transitionImportJob('job', 'publish', 'Bearer user')).rejects.toMatchObject({ code });
});
it.each([undefined, '', ' exact reason '])(
  'retains encoded URL, authorization, reason bytes and one POST (%s)',
  async (reason) => {
    const job = { id: 'result', status: 'approved' };
    const request = vi.fn().mockResolvedValue(Response.json(job));
    vi.stubGlobal('fetch', request);
    await expect(transitionImportJob('job/a', 'approve', 'Bearer user', reason)).resolves.toEqual(job);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      expect.stringMatching(/\/import-jobs\/job%2Fa\/approve$/),
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer user' },
        body: JSON.stringify(reason ? { reason } : {}),
      }),
    );
  },
);
