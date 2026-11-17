import { safeSearchHref } from '../../lib/search-workspace';

export type SearchPosition = { scroll: number; focusId: string; filtersOpen: boolean; draft: string; preview: string | null };
const key = (href: string) => 'atlas-search-return:' + href;
export function rememberSearch(href: string, position: SearchPosition) {
  if (!safeSearchHref(href)) return;
  try { sessionStorage.setItem(key(href), JSON.stringify(position)); } catch { /* Native links and browser history remain available. */ }
}
export function takeSearchPosition(href: string): SearchPosition | null {
  try {
    const raw = sessionStorage.getItem(key(href)); sessionStorage.removeItem(key(href));
    const value = raw ? JSON.parse(raw) : null;
    return value && Number.isFinite(value.scroll) && typeof value.focusId === 'string' && typeof value.draft === 'string' &&
      typeof value.filtersOpen === 'boolean' && (value.preview == null || typeof value.preview === 'string') ? value : null;
  } catch { return null; }
}
