import type { AnonymousBrowsingPolicy, AnonymousRate } from './anonymous-browsing-policy';

// Compose runs one gateway instance. A shared atomic store is required before scaling it.
type Bucket = { tokens: number; updatedAt: number };
const perIpBuckets = new Map<string, Bucket>();
let totalBucket: Bucket | undefined;
let configuration = '';
const MAX_BUCKETS = 20_000;

function windowMs(rate: AnonymousRate): number {
  return rate.windowValue * { minutes: 60_000, hours: 3_600_000, days: 86_400_000 }[rate.windowUnit];
}

function refill(rate: AnonymousRate, previous: Bucket | undefined, now: number): Bucket {
  const perMs = rate.requests / windowMs(rate);
  return {
    tokens: Math.min(rate.requests, (previous?.tokens ?? rate.requests) + Math.max(0, now - (previous?.updatedAt ?? now)) * perMs),
    updatedAt: now,
  };
}

function retrySeconds(rate: AnonymousRate, tokens: number): number {
  return Math.max(1, Math.ceil((1 - tokens) * windowMs(rate) / rate.requests / 1000));
}

export function anonymousApiLimit(clientIp: string, policy: AnonymousBrowsingPolicy, now = Date.now()): number | null {
  if (!policy.allowed) return null;
  const signature = JSON.stringify([policy.revision, policy.perIp, policy.total]);
  if (signature !== configuration) {
    perIpBuckets.clear();
    totalBucket = undefined;
    configuration = signature;
  }
  const ip = refill(policy.perIp, perIpBuckets.get(clientIp), now);
  const total = refill(policy.total, totalBucket, now);
  const ipRetry = ip.tokens < 1 - 1e-9 ? retrySeconds(policy.perIp, ip.tokens) : 0;
  const totalRetry = total.tokens < 1 - 1e-9 ? retrySeconds(policy.total, total.tokens) : 0;
  const accepted = ipRetry === 0 && totalRetry === 0;
  perIpBuckets.delete(clientIp);
  perIpBuckets.set(clientIp, { ...ip, tokens: Math.max(0, ip.tokens - (accepted ? 1 : 0)) });
  if (perIpBuckets.size > MAX_BUCKETS) perIpBuckets.delete(perIpBuckets.keys().next().value!);
  totalBucket = { ...total, tokens: Math.max(0, total.tokens - (accepted ? 1 : 0)) };
  return accepted ? null : Math.max(ipRetry, totalRetry);
}
