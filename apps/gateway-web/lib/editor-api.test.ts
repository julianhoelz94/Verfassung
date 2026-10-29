// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ token: 'test-session' as string | undefined }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => auth.token ? { value: auth.token } : undefined }),
}));
vi.mock('./session', () => ({ SESSION_COOKIE: 'ca_session' }));

import { getDraftPreview, listSessions, manageSession, publishSession, saveDraft, saveStructuredDraft, submitReview } from './editor-api';

const published = { sessionId: 'session-1', status: 'published', newVersionId: 'version-2' };

function delayedFetch(delayMs?: number) {
  return vi.fn<typeof fetch>((_input, init) => new Promise((resolve, reject) => {
    const signal = init!.signal!;
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    if (delayMs !== undefined) setTimeout(() => resolve(Response.json(published)), delayMs);
  }));
}

describe('editor request outcomes', () => {
  beforeEach(() => {
    auth.token = 'test-session';
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function useTimedDeadlines() {
    vi.useFakeTimers();
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), ms);
      return controller.signal;
    });
  }

  it('requests the owned archive independently from status and pagination', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json([]));
    vi.stubGlobal('fetch', fetchMock);
    await expect(listSessions({ openedBy: 'me', archived: true, status: 'published', limit: 100, offset: 100 })).resolves.toEqual([]);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(Object.fromEntries(url.searchParams)).toEqual({ openedBy: 'me', archived: 'true', status: 'published', limit: '100', offset: '100' });
  });

  it.each(['archive', 'restore', 'discard'] as const)('accepts a bodyless successful session %s response', async action => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(manageSession('session-1', action)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(action === 'discard' ? /\/edit-sessions\/session-1$/ : /\/edit-sessions\/session-1\/archive$/), expect.objectContaining({
      method: action === 'discard' ? 'DELETE' : 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer test-session' }),
      ...(action === 'discard' ? {} : { body: JSON.stringify({ archived: action === 'archive' }) }),
    }));
  });

  it('rejects a session state conflict rather than treating deletion as successful', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json({ code: 'conflict' }, { status: 409 })));
    await expect(manageSession('session-1', 'discard')).rejects.toMatchObject({ key: 'not_ready' });
  });
  it.each([['FOOTNOTE_MARK_CARDINALITY','footnote_marks'],['TEXT_LINE_BREAKS','text_line_breaks']])('keeps actionable structured validation %s localized',async(code,key)=>{vi.stubGlobal('fetch',vi.fn<typeof fetch>().mockResolvedValue(Response.json({code},{status:400})));await expect(saveStructuredDraft('session-1',{expectedGeneration:0,operations:[]})).rejects.toMatchObject({key,code});});

  it('allows one coordinated publication to finish after the normal ten-second deadline', async () => {
    useTimedDeadlines();
    const fetchMock = delayedFetch(25_000);
    vi.stubGlobal('fetch', fetchMock);
    const outcome = publishSession('session-1', { hopKind: 'editorial_correction' });

    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock.mock.calls[0][1]!.signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(15_000);

    await expect(outcome).resolves.toEqual(published);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/edit-sessions\/session-1\/publish$/), expect.objectContaining({
      method: 'POST', body: JSON.stringify({ hopKind: 'editorial_correction' }),
      headers: expect.objectContaining({ Authorization: 'Bearer test-session' }),
    }));
  });

  it('bounds a stalled publication at sixty seconds and does not retry it', async () => {
    useTimedDeadlines();
    const fetchMock = delayedFetch();
    vi.stubGlobal('fetch', fetchMock);
    const outcome = publishSession('session-1', { hopKind: 'legal' });
    const assertion = expect(outcome).rejects.toMatchObject({ name: 'EditorApiError', key: 'publish_unconfirmed' });

    await vi.advanceTimersByTimeAsync(59_999);
    expect(fetchMock.mock.calls[0][1]!.signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retains the ten-second deadline for reading a session', async () => {
    useTimedDeadlines();
    const fetchMock = delayedFetch();
    vi.stubGlobal('fetch', fetchMock);
    const assertion = expect(getDraftPreview('session-1')).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retains the ten-second deadline for saving and reports an unknown outcome without retrying', async () => {
    useTimedDeadlines();
    const fetchMock = delayedFetch();
    vi.stubGlobal('fetch', fetchMock);
    const assertion = expect(saveDraft('session-1', 'article-1', 'Title', 'Text'))
      .rejects.toMatchObject({ name: 'EditorApiError', key: 'request_unconfirmed' });
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    new DOMException('Request timed out', 'TimeoutError'),
    new TypeError('fetch failed'),
  ])('maps a lost publication response to an unconfirmed outcome: %s', async (error) => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(error);
    vi.stubGlobal('fetch', fetchMock);
    await expect(publishSession('session-1', { hopKind: 'legal' }))
      .rejects.toMatchObject({ name: 'EditorApiError', key: 'publish_unconfirmed' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('also handles a timeout while reading a successful publication response body', async () => {
    const response = Response.json(published);
    vi.spyOn(response, 'json').mockRejectedValue(new DOMException('Request timed out', 'TimeoutError'));
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetchMock);
    await expect(publishSession('session-1', { hopKind: 'legal' }))
      .rejects.toMatchObject({ key: 'publish_unconfirmed' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([502, 503, 504])('does not infer publication failure from an intermediary HTTP %s', async (status) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('Upstream unavailable', { status }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(publishSession('session-1', { hopKind: 'legal' }))
      .rejects.toMatchObject({ key: 'publish_unconfirmed' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [401, 'unauthorized', 'sign_in'],
    [403, 'step_up_required', 'step_up'],
    [403, 'forbidden', 'forbidden'],
    [409, 'not_tip', 'not_tip'],
    [400, 'invalid_input', 'invalid'],
  ])('preserves the service rejection for HTTP %s / %s', async (status, code, key) => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json({ code }, { status })));
    await expect(publishSession('session-1', { hopKind: 'legal' })).rejects.toMatchObject({ key, code });
  });

  it('keeps the sign-in requirement when there is no session cookie', async () => {
    auth.token = undefined;
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    await expect(publishSession('session-1', { hopKind: 'legal' })).rejects.toMatchObject({ key: 'sign_in' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps a disconnected review submission to an unconfirmed outcome without retrying', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(submitReview('session-1')).rejects.toMatchObject({ key: 'request_unconfirmed' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
