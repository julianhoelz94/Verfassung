import { describe, expect, it } from 'vitest';
import { anonymousApiLimit } from './anonymous-api-limit';

describe('anonymous API quota', () => {
  it('allows a normal burst, then returns a retry time and refills', () => {
    const ip = '198.51.100.91';
    for (let i = 0; i < 120; i++) expect(anonymousApiLimit(ip, 1_000)).toBeNull();
    expect(anonymousApiLimit(ip, 1_000)).toBe(1);
    expect(anonymousApiLimit(ip, 1_500)).toBeNull();
  });

  it('keeps client IP budgets separate', () => {
    const first = '198.51.100.92';
    for (let i = 0; i < 120; i++) anonymousApiLimit(first, 2_000);
    expect(anonymousApiLimit(first, 2_000)).toBe(1);
    expect(anonymousApiLimit('198.51.100.93', 2_000)).toBeNull();
  });
});
