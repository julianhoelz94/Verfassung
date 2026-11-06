import { safeReturnTo } from '../../../lib/return-to';

/** Preserve saved library navigation while moving only editorial GET destinations. */
export function documentLibraryLocation(params: Record<string, string | undefined>, selection: Record<string, string> = {}): string {
  const query = new URLSearchParams();
  for (const key of ['q', 'folderId', 'tagId', 'status', 'sort', 'offset', 'error', 'saved', 'created']) {
    if (params[key]) query.set(key, params[key]);
  }
  if (params.returnTo) query.set('returnTo', safeReturnTo(params.returnTo, '/documents'));
  for (const [key, value] of Object.entries(selection)) query.set(key, value);
  return `/documents${query.size ? `?${query}` : ''}`;
}
