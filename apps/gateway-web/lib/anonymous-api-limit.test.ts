import { describe, expect, it } from 'vitest';
import { anonymousApiLimit } from './anonymous-api-limit';
import type { AnonymousBrowsingPolicy } from './anonymous-browsing-policy';

const policy: AnonymousBrowsingPolicy = {
  allowed: true,
  perIp: { requests: 600, windowValue: 1, windowUnit: 'minutes' },
  total: { requests: 6000, windowValue: 1, windowUnit: 'minutes' },
};

describe('anonymous API quota', () => {
  it('allows a normal burst, then returns a retry time and refills', () => {
    const ip = '198.51.100.91';
    for (let i = 0; i < 600; i++) expect(anonymousApiLimit(ip, policy, 1_000)).toBeNull();
    expect(anonymousApiLimit(ip, policy, 1_000)).toBe(1);
    expect(anonymousApiLimit(ip, policy, 1_100)).toBeNull();
  });

  it('keeps client IP budgets separate', () => {
    const first = '198.51.100.92';
    for (let i = 0; i < 600; i++) anonymousApiLimit(first, policy, 2_000);
    expect(anonymousApiLimit(first, policy, 2_000)).toBe(1);
    expect(anonymousApiLimit('198.51.100.93', policy, 2_000)).toBeNull();
  });

  it('enforces the combined quota across IPs and honors hour windows', () => {
    const shared: AnonymousBrowsingPolicy = {
      allowed: true,
      perIp: { requests: 10, windowValue: 1, windowUnit: 'days' },
      total: { requests: 2, windowValue: 1, windowUnit: 'hours' },
    };
    expect(anonymousApiLimit('one', shared, 10_000)).toBeNull();
    expect(anonymousApiLimit('two', shared, 10_000)).toBeNull();
    expect(anonymousApiLimit('three', shared, 10_000)).toBe(1800);
    expect(anonymousApiLimit('three', shared, 1_810_000)).toBeNull();
  });

  it('starts a fresh budget after an administrator changes the policy', () => {
    const limited: AnonymousBrowsingPolicy = {
      allowed: true, perIp: { requests: 1, windowValue: 1, windowUnit: 'days' },
      total: { requests: 2, windowValue: 1, windowUnit: 'days' }, revision: 1,
    };
    expect(anonymousApiLimit('renewed', limited, 1_000)).toBeNull();
    expect(anonymousApiLimit('renewed', limited, 1_000)).not.toBeNull();
    expect(anonymousApiLimit('renewed', { ...limited, revision: 2 }, 1_000)).toBeNull();
  });
});
