import { NextRequest, NextResponse } from 'next/server';
import { AmendmentApiError } from '../../../lib/amendment-editor-api';
import { EditorApiError } from '../../../lib/editor-api';
import * as amendment from './amendment-handlers';
import * as draft from './draft-handlers';
import * as source from './source-handlers';
import * as publication from './publication-handlers';
import { commandContext, editorPath, hasTrustedOrigin, redirectTo, value, type CommandContext } from './request';

type CommandHandler = (context: CommandContext) => Promise<NextResponse> | NextResponse;

// Explicit keys prevent unknown command names from resolving inherited object properties.
const handlers = new Map<string, CommandHandler>([
  ['amendment-save', amendment.saveAmendment],
  ['amendment-withdraw', amendment.withdraw],
  ['amendment-publish', amendment.publish],
  ['amendment-confirm', amendment.confirm],
  ['open', draft.open],
  ['open-sources', context => draft.open(context, true)],
  ['source-evidence', source.save],
  ['source-evidence-changes', source.requestChanges],
  ['load', draft.load],
  ['structured-save', draft.saveStructured],
  ['save', draft.save],
  ['details', publication.details],
  ['review', publication.review],
  ['approve', publication.approve],
  ['publish', publication.publish],
]);

/** Trusted-origin and native body parsing precede command dispatch and its known-error translation. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!hasTrustedOrigin(request)) return new NextResponse('Forbidden', { status: 403 });
  const context = commandContext(request, await request.formData());
  try {
    const handler = handlers.get(context.command);
    if (!handler) return redirectTo(request, editorPath(context.form, { error: 'invalid' }));
    return await handler(context);
  } catch (error) {
    return commandFailure(context, error);
  }
}

/** Known amendment errors take precedence; authentication step-up redirects precede JSON form errors. */
function commandFailure(context: CommandContext, error: unknown): NextResponse {
  if (error instanceof AmendmentApiError) return amendmentFailure(context, error);
  if (error instanceof EditorApiError && error.code === 'step_up_required') {
    return redirectTo(context.request, `/account/step-up?returnTo=${encodeURIComponent(editorPath(context.form))}`);
  }
  if (error instanceof EditorApiError) return editorFailure(context, error);
  throw error;
}

/** New amendment errors retain constitution context; existing records retain only their selected identity. */
function amendmentFailure({ request, form }: CommandContext, error: AmendmentApiError): NextResponse {
  const id = value(form, 'amendmentId');
  const detail = id && id !== 'new' ? id : 'new';
  const params = new URLSearchParams({ error: error.key });
  if (detail === 'new' && value(form, 'constitutionId')) params.set('constitutionId', value(form, 'constitutionId'));
  return redirectTo(request, `/editor/amendments/${encodeURIComponent(detail)}?${params}`);
}

/** Only source-evidence saves return JSON errors; other editor commands preserve native navigation. */
function editorFailure({ request, form, command }: CommandContext, error: EditorApiError): NextResponse {
  if (command === 'source-evidence' && request.headers.get('accept')?.includes('application/json')) {
    return NextResponse.json({ key: error.key === 'invalid' ? 'source_evidence_invalid' : error.key }, { status: 400 });
  }
  return redirectTo(request, editorPath(form, { error: error.key }));
}
