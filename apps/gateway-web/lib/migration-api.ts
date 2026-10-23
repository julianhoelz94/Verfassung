import { catalogBaseUrl, contentBaseUrl, readJson, type ConstitutionSummary, type OrderedNode } from './api';

export type Jurisdiction = { id: string; parentId: string | null; name: string; slug: string; kind: string; code: string | null; historical: boolean; existedFrom: string | null; existedUntil: string | null };
export type JurisdictionDetail = { jurisdiction: Jurisdiction; ancestors: Jurisdiction[]; children: Jurisdiction[]; constitutions: ConstitutionSummary[] };

export function listJurisdictions(parentId?: string): Promise<Jurisdiction[] | null> {
  return readJson(`${catalogBaseUrl()}/jurisdictions${parentId ? `?parentId=${encodeURIComponent(parentId)}` : ''}`, 'catalog');
}
export function getJurisdiction(id: string): Promise<JurisdictionDetail | null> {
  return readJson(`${catalogBaseUrl()}/jurisdictions/${encodeURIComponent(id)}`, 'catalog');
}
export function getStructuredSnapshot(versionId: string): Promise<{ versionId: string; generation: number; settingsRevisionId: string | null; roots: OrderedNode[] } | null> {
  return readJson(`${contentBaseUrl()}/versions/${encodeURIComponent(versionId)}/content`, 'content');
}
