import { NextResponse, type NextRequest } from 'next/server';
import { readWriteBody } from '../../../lib/amendment-form';
import { appendRevision, confirmAmendmentQuotes, createAmendment, publishAmendment, withdrawAmendment } from '../../../lib/amendment-editor-api';
import { redirectTo, value, type CommandContext } from './request';

/** Validates the writable body before deciding whether an amendment is new, preserving error precedence. */
export async function saveAmendment({ request, form }: CommandContext): Promise<NextResponse> {
  const id = value(form, 'amendmentId');
  const constitutionId = value(form, 'constitutionId');
  const body = readWriteBody(form);
  if (!id || id === 'new') {
    if (!constitutionId) return redirectTo(request, '/editor/amendments?error=invalid');
    const created = await createAmendment(constitutionId, body);
    return savedAmendmentResponse(request, created.id);
  }
  await appendRevision(id, body);
  return savedAmendmentResponse(request, id);
}

/** JSON saves keep the mounted form on errors; native submissions retain their redirect destination. */
function savedAmendmentResponse(request: NextRequest, id: string): NextResponse {
  const destination = `/editor/amendments/${encodeURIComponent(id)}?saved=1`;
  return request.headers.get('accept')?.includes('application/json')
    ? NextResponse.json({ destination }) : redirectTo(request, destination);
}

/** A transition can target only an existing selected record and returns its specific outcome flag. */
async function transition(context: CommandContext, action: (id: string) => Promise<unknown>, outcome: string): Promise<NextResponse> {
  const id = value(context.form, 'amendmentId');
  if (!id || id === 'new') return redirectTo(context.request, '/editor/amendments?error=invalid');
  await action(id);
  return redirectTo(context.request, `/editor/amendments/${encodeURIComponent(id)}?${outcome}=1`);
}

/** Withdraws the selected legal-change record without creating or publishing a revision. */
export function withdraw(context: CommandContext): Promise<NextResponse> {
  return transition(context, withdrawAmendment, 'withdrawn');
}

/** Publishes only the existing amendment selected by its form identity. */
export function publish(context: CommandContext): Promise<NextResponse> {
  return transition(context, publishAmendment, 'published');
}

/** Confirms quotations independently of publishing the selected record. */
export function confirm(context: CommandContext): Promise<NextResponse> {
  return transition(context, confirmAmendmentQuotes, 'confirmed');
}
