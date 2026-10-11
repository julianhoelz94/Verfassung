// One gateway instance serves the public edge in the Compose deployment.
// A shared store is required before scaling the gateway horizontally.
type Bucket = { tokens: number; updatedAt: number };
const buckets = new Map<string, Bucket>();
const CAPACITY = 600;
const REFILL_PER_MS = CAPACITY / 60_000;
const MAX_BUCKETS = 20_000;

export function anonymousApiLimit(clientIp: string, now = Date.now()): number | null {
  const previous = buckets.get(clientIp);
  const tokens = Math.min(CAPACITY, (previous?.tokens ?? CAPACITY) + Math.max(0, now - (previous?.updatedAt ?? now)) * REFILL_PER_MS);
  if (tokens < 1) {
    buckets.delete(clientIp);
    buckets.set(clientIp, { tokens, updatedAt: now });
    if (buckets.size > MAX_BUCKETS) buckets.delete(buckets.keys().next().value!);
    return Math.max(1, Math.ceil((1 - tokens) / REFILL_PER_MS / 1000));
  }
  // Refresh insertion order so the oldest inactive clients are evicted first.
  buckets.delete(clientIp);
  buckets.set(clientIp, { tokens: tokens - 1, updatedAt: now });
  if (buckets.size > MAX_BUCKETS) buckets.delete(buckets.keys().next().value!);
  return null;
}
