// READ-2/API-1: a translation response must account for every submitted passage.
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cookies } from 'next/headers';
import { cookieJar, json } from '../../test/server-boundary';
import { translateContentAction } from './actions';
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
beforeEach(() => vi.mocked(cookies).mockResolvedValue(cookieJar({ ca_session: 'reader-session' }) as unknown as Awaited<ReturnType<typeof cookies>>));
afterEach(() => vi.restoreAllMocks());
describe('translation action contract', () => {
  it('binds source passages and languages to the reader session and returns their ordered translations', async () => {
    const upstream = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ texts: ['First translation', 'Second translation'], provider: 'google' }));
    expect(await translateContentAction(['Erster Text', 'Zweiter Text'], 'de', 'en')).toEqual(['First translation', 'Second translation']);
    expect(JSON.parse(String(upstream.mock.calls[0][1]?.body))).toEqual({ texts: ['Erster Text', 'Zweiter Text'], sourceLanguage: 'de', targetLanguage: 'en' }); expect(new Headers(upstream.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer reader-session');
  });
  it.each([{}, { texts: [] }, { texts: ['Only one'] }, { texts: ['One', 2] }, { texts: null }])('rejects an incomplete or malformed provider result %j', async response => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(response)); await expect(translateContentAction(['Erster Text', 'Zweiter Text'], 'de', 'en')).rejects.toThrow();
  });
  it('does not send authored content for an anonymous visitor', async () => {
    vi.mocked(cookies).mockResolvedValue(cookieJar() as unknown as Awaited<ReturnType<typeof cookies>>); const upstream = vi.spyOn(globalThis, 'fetch'); await expect(translateContentAction(['Authored text'], 'de', 'en')).rejects.toThrow('Login required'); expect(upstream).not.toHaveBeenCalled();
  });
  it('retains a provider rejection and does not retry the request', async () => {
    const upstream = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ code: 'quota_exceeded' }, 429)); await expect(translateContentAction(['Authored text'], 'de', 'en')).rejects.toMatchObject({ code: 'quota_exceeded' }); expect(upstream).toHaveBeenCalledTimes(1);
  });
});
