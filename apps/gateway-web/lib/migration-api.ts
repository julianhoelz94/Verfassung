import { amendmentBaseUrl, catalogBaseUrl, contentBaseUrl, readJson, type Amendment, type ConstitutionSummary, type OrderedNode } from './api';

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

export type AmendmentRegisterPage = { constitutionId: string; items: Amendment[]; total: number; limit: number; offset: number };
export function getAmendmentRegister(constitutionId: string, query: URLSearchParams): Promise<AmendmentRegisterPage | null> {
  return readJson(`${amendmentBaseUrl()}/constitutions/${encodeURIComponent(constitutionId)}/amendment-register?${query}`, 'amendment');
}

export type CuratedComparison = { id: string; state: 'draft' | 'reviewed' | 'published'; needsReview: boolean; reviewReason: string | null; definition: {
  title: string; attribution: string; sourceUrl: string; sourceDocumentId: string; sourceDocumentRevision: number;
  columns: { constitutionId: string; versionId: string; label: string }[];
  topics: { title: string; passages: { column: number; logicalId: string }[]; missingColumns: number[] }[];
} };
export function listCuratedComparisons(authorization?: string): Promise<{ id: string; title: string; state: string; needsReview: boolean }[] | null> {
  return readJson(`${catalogBaseUrl()}/curated-comparisons`, 'catalog', authorization);
}
export function getCuratedComparison(id: string, authorization?: string): Promise<CuratedComparison | null> {
  return readJson(`${catalogBaseUrl()}/curated-comparisons/${encodeURIComponent(id)}`, 'catalog', authorization);
}
