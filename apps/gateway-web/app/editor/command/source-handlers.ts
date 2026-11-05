import { NextResponse } from 'next/server';
import type { SourceEvidence } from '../../../lib/api';
import { EditorApiError, requestSourceEvidenceChanges, saveSourceEvidence } from '../../../lib/editor-api';
import { editorPath, redirectTo, value, type CommandContext } from './request';

/** A mandatory source-write pin accepts decimal digits and safe integers, including zero. */
function expectedRevision(form: FormData): number {
  const raw = value(form, 'expectedRevision');
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new EditorApiError('source_evidence_invalid');
  return Number(raw);
}

/** JSON clients retain their edited evidence on errors; correction reasons remain outside the evidence. */
export async function save({ request, form, sessionId }: CommandContext): Promise<NextResponse> {
  const revision = expectedRevision(form);
  const evidence: SourceEvidence = { description: value(form, 'description'), datePrecision: 'unknown' };
  const preview = await saveSourceEvidence(sessionId, revision, evidence, value(form, 'reason'));
  if (request.headers.get('accept')?.includes('application/json')) return NextResponse.json(preview);
  return redirectTo(request, editorPath(form, { saved: '1' }));
}

/** Requested changes remain a native redirect workflow, even when the client accepts JSON. */
export async function requestChanges({ request, form, sessionId }: CommandContext): Promise<NextResponse> {
  await requestSourceEvidenceChanges(sessionId, expectedRevision(form), value(form, 'reason'));
  return redirectTo(request, editorPath(form));
}
