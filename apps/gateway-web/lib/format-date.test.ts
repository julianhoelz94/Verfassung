// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { formatDate } from './format-date';

describe('formatDate', () => {
  it('formats calendar dates without timezone shift', () => {
    expect(formatDate('2022-12-19')).toBe('December 19, 2022');
  });
});
