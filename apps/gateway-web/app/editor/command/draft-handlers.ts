import type { NextResponse } from 'next/server';
import { openSession, saveDraft, saveStructuredDraft } from '../../../lib/editor-api';
import { editorPath, redirectTo, value, type CommandContext } from './request';

/** Source-only sessions always open corrections; ordinary sessions require a supported explicit hop. */
export async function open(context: CommandContext, sourceOnly = false): Promise<NextResponse> {
  const { request, form } = context;
  const hopKind = sourceOnly ? 'editorial_correction' : value(form, 'hopKind');
  if (hopKind !== 'legal' && hopKind !== 'editorial_correction') return redirectTo(request, '/editor?error=invalid');
  const versionId = value(form, 'versionId');
  const session = await openSession(versionId, hopKind);
  return redirectTo(request, `/editor?versionId=${encodeURIComponent(versionId)}&sessionId=${encodeURIComponent(session.id)}${sourceOnly ? '&scope=sources' : ''}`);
}

/** Loading a selected session is navigation only and makes no upstream write. */
export function load({ request, form, sessionId }: CommandContext): NextResponse {
  if (!sessionId) return redirectTo(request, '/editor?error=session_id');
  return redirectTo(request, editorPath(form));
}

/** Structured JSON parsing and shape failures retain input context without contacting the service. */
export async function saveStructured({ request, form, sessionId }: CommandContext): Promise<NextResponse> {
  let payload;
  try { payload = JSON.parse(String(form.get('structuredDraft') ?? '')); } catch { return redirectTo(request, editorPath(form, { error: 'invalid' })); }
  if (!payload || !Number.isSafeInteger(payload.expectedGeneration) || !Array.isArray(payload.operations)) return redirectTo(request, editorPath(form, { error: 'invalid' }));
  await saveStructuredDraft(sessionId, payload);
  return redirectTo(request, editorPath(form, { saved: '1' }));
}

/** Preserves the legacy article title/body form contract and its current editor selection. */
export async function save({ request, form, sessionId }: CommandContext): Promise<NextResponse> {
  await saveDraft(sessionId, value(form, 'articleId'), value(form, 'title'), value(form, 'body'));
  return redirectTo(request, editorPath(form, { saved: '1' }));
}
