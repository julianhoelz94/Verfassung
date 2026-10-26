import { describe, expect, it, vi } from 'vitest';
import { fetchWithTimeout } from './fetch-with-timeout';

describe('service request deadlines', () => {
  it('preserves request options and provides a deadline signal', async () => {
    const response = new Response('{}');
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response);
    expect(await fetchWithTimeout('http://service', { method: 'POST', body: '{}' }, fetchImpl)).toBe(response);
    expect(fetchImpl).toHaveBeenCalledWith('http://service', expect.objectContaining({
      method: 'POST', body: '{}', signal: expect.any(AbortSignal),
    }));
  });

  it('keeps caller cancellation effective', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'));
    await fetchWithTimeout('http://service', { signal: controller.signal }, fetchImpl);
    const signal = fetchImpl.mock.calls[0][1]!.signal!;
    expect(signal.aborted).toBe(false);
    controller.abort();
    expect(signal.aborted).toBe(true);
  });

  it('aborts a stalled request without retrying it', async () => {
    const fetchImpl = vi.fn<typeof fetch>((_input, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true });
    }));
    await expect(fetchWithTimeout('http://service', {}, fetchImpl, 1)).rejects.toMatchObject({ name: 'TimeoutError' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('preserves cancellation carried by a Request object', async () => {
    const controller = new AbortController();
    const request = new Request('http://service', { signal: controller.signal });
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'));
    await fetchWithTimeout(request, {}, fetchImpl);
    controller.abort();
    expect(fetchImpl.mock.calls[0][1]!.signal!.aborted).toBe(true);
  });

  it('bounds a request even when its caller has not cancelled it', async () => {
    const fetchImpl = vi.fn<typeof fetch>((_input, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true });
    }));
    await expect(fetchWithTimeout('http://service', { signal: new AbortController().signal }, fetchImpl, 1))
      .rejects.toMatchObject({ name: 'TimeoutError' });
  });
});
