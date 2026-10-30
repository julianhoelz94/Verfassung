import type { WikiTargetType } from './api';

export type WikiOwner = { targetType: WikiTargetType; targetId: string; code?: string; jurisdictionId?: string };

export function wikiPublicPath({ targetType, targetId, code, jurisdictionId }: WikiOwner): string {
  if (targetType === 'jurisdiction') return `/jurisdictions/${encodeURIComponent(targetId)}`;
  if (targetType === 'country') return `/countries/${encodeURIComponent(code ?? '')}`;
  const owner = jurisdictionId ? `/jurisdictions/${encodeURIComponent(jurisdictionId)}` : `/countries/${encodeURIComponent(code ?? '')}`;
  return `${owner}/constitutions/${encodeURIComponent(targetId)}`;
}

export function wikiEditPath(owner: WikiOwner, extra: Record<string, string> = {}): string {
  const query = new URLSearchParams();
  if (owner.code) query.set('code', owner.code);
  if (owner.jurisdictionId) query.set('jurisdictionId', owner.jurisdictionId);
  for (const [key, value] of Object.entries(extra)) query.set(key, value);
  return `/editor/wiki/${owner.targetType}/${encodeURIComponent(owner.targetId)}${query.size ? `?${query}` : ''}`;
}
