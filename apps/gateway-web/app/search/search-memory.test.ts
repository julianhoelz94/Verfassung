import { afterEach, expect, it, vi } from 'vitest';
import { rememberSearch, takeSearchPosition } from './search-memory';
const position = { scroll: 120, focusId: 'result', draft: 'words', filtersOpen: false, preview: null };
afterEach(() => { sessionStorage.clear(); vi.restoreAllMocks(); });
it('retains public per-tab search state once and rejects malformed records', () => {
  rememberSearch('/search?q=words', position);
  expect(takeSearchPosition('/search?q=words')).toEqual(position); expect(takeSearchPosition('/search?q=words')).toBeNull();
  rememberSearch('/editor', position); expect(sessionStorage.length).toBe(0);
  for (const value of ['{', '{"scroll":"bad"}', 'null']) {
    sessionStorage.setItem('atlas-search-return:/search', value); expect(takeSearchPosition('/search')).toBeNull();
  }
});
it('leaves native links available when storage is disabled', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('disabled'); });
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('disabled'); });
  expect(() => rememberSearch('/search', position)).not.toThrow(); expect(takeSearchPosition('/search')).toBeNull();
});
