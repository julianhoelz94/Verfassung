import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiUnavailableError, getVersionSettings, listArticlePage, readJson, sendJson } from './api';

afterEach(() => vi.restoreAllMocks());

describe('upstream JSON failure handling', () => {
  it('loads private import settings with the staff authorization', async () => {
    const fetchImpl = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    await getVersionSettings('private-version', 'Bearer reviewer-session');
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining('/versions/private-version/settings'), expect.objectContaining({ headers: { Authorization: 'Bearer reviewer-session' } }));
  });

  it('preserves empty nullable responses and missing resources', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('')).mockResolvedValueOnce(new Response('', { status: 404 }));
    expect(await readJson('http://catalog/value', 'catalog')).toBeNull();
    expect(await readJson('http://catalog/missing', 'catalog')).toBeNull();
  });

  it('maps malformed JSON to the recoverable service-unavailable state', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>bad gateway</html>'));
    await expect(readJson('http://catalog/value', 'catalog')).rejects.toBeInstanceOf(ApiUnavailableError);
  });

  it('handles a response body that fails after headers arrive', async () => {
    const response = new Response('{}');
    vi.spyOn(response, 'text').mockRejectedValue(new Error('stream interrupted'));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
    await expect(readJson('http://catalog/value', 'catalog')).rejects.toBeInstanceOf(ApiUnavailableError);
  });

  it('does not retry a write with an unreadable response', async () => {
    const fetchImpl = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{'));
    await expect(sendJson('http://catalog/value', 'catalog', 'POST', {})).rejects.toBeInstanceOf(ApiUnavailableError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each(['{', 'null', '{}'])('normalizes invalid paginated content %s', async (body) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body));
    await expect(listArticlePage('version-1')).rejects.toBeInstanceOf(ApiUnavailableError);
  });
});
