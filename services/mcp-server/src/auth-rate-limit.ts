/** Fixed authentication windows with a hard memory cap; never evict a live quota. */
export function createAuthenticationRateLimit(maxRequests = 120, windowMs = 60_000, maxClients = 10_000) {
  const windows = new Map<string, { expiresAt: number; count: number }>();
  return (ip: string, now = performance.now()): boolean => {
    // Windows keep their insertion order because successful requests only update
    // counts. Stop at the first live window instead of rescanning every client.
    for (const [key, window] of windows) {
      if (window.expiresAt > now) break;
      windows.delete(key);
    }
    const window = windows.get(ip);
    if (window) {
      window.count += 1;
      return window.count > maxRequests;
    }
    // Unknown clients fail closed at capacity until an existing window expires.
    if (windows.size >= maxClients) return true;
    windows.set(ip, { expiresAt: now + windowMs, count: 1 });
    return false;
  };
}
