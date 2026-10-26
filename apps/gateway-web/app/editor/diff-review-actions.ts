'use server';

import { revalidatePath } from 'next/cache';
import { decideAmendmentDiff, getAmendmentDiffReview } from '../../lib/amendment-editor-api';
import { decideEditorDiff, getEditorDiffReview } from '../../lib/editor-api';
import type { DiffReviewState, ReviewDecisionInput } from '../../lib/diff-review';

export type ReviewTarget = { kind: 'amendment' | 'editor'; id: string };
type Result = { review: DiffReviewState } | { error: string };

function failure(error: unknown): Result {
  return { error: error instanceof Error ? error.message : 'Could not update the review. Refresh and try again.' };
}

export async function refreshDiffReviewAction(target: ReviewTarget): Promise<Result> {
  try {
    return { review: target.kind === 'amendment' ? await getAmendmentDiffReview(target.id) : await getEditorDiffReview(target.id) };
  } catch (error) { return failure(error); }
}

export async function saveDiffDecisionAction(target: ReviewTarget, current: DiffReviewState, decision: ReviewDecisionInput): Promise<Result> {
  try {
    const review = target.kind === 'amendment'
      ? await decideAmendmentDiff(target.id, current.revisionId ?? '', decision)
      : await decideEditorDiff(target.id, current.draftGeneration ?? -1, decision);
    revalidatePath(target.kind === 'amendment' ? `/editor/amendments/${target.id}` : '/editor');
    return { review };
  } catch (error) { return failure(error); }
}
