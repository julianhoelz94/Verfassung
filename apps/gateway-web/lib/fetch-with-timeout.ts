const SERVICE_TIMEOUT_MS = 10_000;

/**
 * Bound service requests, including response-body reads, so an unavailable service
 * cannot leave a page or command waiting indefinitely. Preserve caller cancellation
 * and shorter explicit deadlines. Commands are never retried here.
 */
export function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  fetchImpl: typeof fetch = fetch,
  timeoutMs = SERVICE_TIMEOUT_MS,
): Promise<Response> {
  const deadline = AbortSignal.timeout(timeoutMs);
  const caller = init.signal === undefined && input instanceof Request ? input.signal : init.signal;
  let signal = deadline;
  if (caller) {
    const controller = new AbortController();
    const abort = () => {
      controller.abort(caller.aborted ? caller.reason : deadline.reason);
      caller.removeEventListener('abort', abort);
      deadline.removeEventListener('abort', abort);
    };
    if (caller.aborted) abort();
    else {
      caller.addEventListener('abort', abort, { once: true });
      deadline.addEventListener('abort', abort, { once: true });
    }
    signal = controller.signal;
  }
  return fetchImpl(input, {
    ...init,
    signal,
  });
}
