export type ReviewRef = {
  versionId: string | null;
  logicalId: string;
  revisionId: string | null;
  occurrenceId: string | null;
  kind: string;
  label: string | null;
  path: string[];
  excerpt: string | null;
  pathLogicalIds?: string[];
};

export type ReviewCandidate = {
  key: string;
  fingerprint: string;
  facet: string;
  level: number;
  beforeRefs: ReviewRef[];
  afterRefs: ReviewRef[];
  ambiguous: boolean;
  groupKey: string | null;
};

export type ReviewDecision = {
  key: string;
  fingerprint: string;
  status: 'open' | 'linked' | 'excluded_with_reason' | 'needs_recheck';
  linkedChangeIds?: string[];
  linkedRowIds?: string[];
  exclusionReason?: string | null;
  reason?: string | null;
  reviewerAcknowledged: boolean;
};

export type DiffReviewState = {
  revisionId?: string;
  draftGeneration?: number;
  sourceVersionId: string;
  targetVersionId?: string;
  candidates: ReviewCandidate[];
  decisions: ReviewDecision[];
  totals: Record<string, number>;
  currentPosition: number | null;
};

export type ReviewDecisionInput = {
  key: string;
  fingerprint: string;
  status: 'linked' | 'excluded_with_reason';
  linkedIds?: string[];
  exclusionReason?: string;
  reviewerAcknowledged?: boolean;
};

export function decisionResolved(candidate: ReviewCandidate, decision?: ReviewDecision): boolean {
  if (!decision || decision.status === 'open' || decision.status === 'needs_recheck') return false;
  if (decision.status === 'excluded_with_reason') return decision.reviewerAcknowledged;
  const ids = decision.linkedChangeIds ?? decision.linkedRowIds ?? [];
  return !candidate.ambiguous || (ids.length > 1 && decision.reviewerAcknowledged);
}

export function decisionReadyForReview(candidate: ReviewCandidate, decision?: ReviewDecision): boolean {
  if (!decision || decision.status === 'open' || decision.status === 'needs_recheck') return false;
  if (decision.status === 'excluded_with_reason') return Boolean(decision.reason ?? decision.exclusionReason);
  const ids = decision.linkedChangeIds ?? decision.linkedRowIds ?? [];
  return ids.length > 0 && (!candidate.ambiguous || ids.length > 1);
}
