import { fetchWithTimeout } from './fetch-with-timeout';
import { ui } from './messages';
import type { Locale } from './locale';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from './session';
import type { DiffReviewState, ReviewDecisionInput } from './diff-review';

const PUBLISH_TIMEOUT_MS = 60_000;

export function editorBaseUrl(): string {
  return process.env.EDITOR_API_URL ?? 'http://localhost/api/editor';
}

export type EditSession = {
  id: string;
  actorId: string;
  versionId: string;
  status: string;
  revisionCount: number;
  hopKind?: 'legal' | 'editorial_correction' | null;
};

export type EditSessionSummary = {
  id: string;
  versionId: string;
  status: string;
  openedBy: string;
  openedAt: string;
  updatedAt: string;
  changedArticleCount: number;
  hopKind?: 'legal' | 'editorial_correction' | null;
};

export type DraftArticle = {
  articleId: string;
  title: string;
  body: string;
};

export type DraftPreview = {
  session: EditSession;
  latestSnapshot: string | null;
  drafts?: DraftArticle[];
  publicContentUpdated?: boolean | null;
  sourceVersionId?: string | null;
  newVersionId?: string | null;
  newVersionLabel?: string | null;
  unitMapping?: Record<string, string> | null;
  sourceGeneration?: number | null;
  settingsRevisionId?: string | null;
  searchIndexStatus?: 'pending' | 'ready' | 'failed' | null;
  amendmentStatus?: 'pending' | 'ready' | 'failed' | null;
  publishComment?: string | null;
  changeRecord?: { title: string; comment: string; documents: { url?: string; fileId?: string; label?: string }[]; changes?: ChangeRecordChange[] } | null;
};

export type ChangeRecordUnitRef = {
  logicalId: string;
  versionId?: string | null;
  occurrenceId?: string | null;
  rootOccurrenceId?: string | null;
  revisionId?: string | null;
  unitKind?: 'node' | 'text_entry' | null;
};

export type ChangeRecordChange = {
  id?: string | null;
  amendmentChangeId?: string | null;
  articleId: string;
  articleNumber: string;
  changeType: 'added' | 'changed' | 'removed';
  note?: string | null;
  beforeRef?: ChangeRecordUnitRef | null;
  afterRef?: ChangeRecordUnitRef | null;
  linkReviewReason?: string | null;
  pendingAfterLogicalId?: string | null;
};

/**
 * Fixed editor error copy keyed by a short identifier. Editor commands redirect with
 * `?error=<key>` and the editor page renders only these strings, so a crafted URL cannot
 * put arbitrary text into the trusted error banner.
 */
export const EDITOR_ERROR_MESSAGES = {
  sign_in: ui.errors.signIn,
  step_up: ui.errors.stepUp,
  forbidden: ui.errors.forbidden,
  not_ready: ui.errors.draftNotReady,
  not_tip: ui.errors.notTip,
  not_editorial_tip: ui.errors.notEditorialTip,
  not_legal_tip: ui.errors.notLegalTip,
  invalid: ui.errors.publishDraftFailed,
  open_failed: ui.errors.openSessionFailed,
  list_failed: ui.errors.listSessionsFailed,
  save_failed: ui.errors.saveDraftFailed,
  review_failed: ui.errors.submitReviewFailed,
  approve_failed: ui.errors.approveDraftFailed,
  publish_failed: ui.errors.publishFailed,
  publish_unconfirmed: {
    en: 'Publication could not be confirmed. It may still be in progress or already complete. Reload this session to check its status before publishing again.',
    de: 'Die Veröffentlichung konnte nicht bestätigt werden. Sie kann noch laufen oder bereits abgeschlossen sein. Laden Sie diese Sitzung neu und prüfen Sie den Status, bevor Sie erneut veröffentlichen.',
  },
  request_unconfirmed: {
    en: 'The result could not be confirmed. Reload this page and check the latest state before repeating the action.',
    de: 'Das Ergebnis konnte nicht bestätigt werden. Laden Sie diese Seite neu und prüfen Sie den aktuellen Stand, bevor Sie die Aktion wiederholen.',
  },
  session_id: ui.errors.sessionIdRequired,
  title: ui.errors.titleSaveFailed,
  failed: ui.errors.editorFailed,
} as const;

export type EditorErrorKey = keyof typeof EDITOR_ERROR_MESSAGES;

export function editorErrorMessage(key: string | undefined, locale: Locale = 'en'): string | null {
  if (!key) {
    return null;
  }
  return (Object.hasOwn(EDITOR_ERROR_MESSAGES, key) ? EDITOR_ERROR_MESSAGES[key as EditorErrorKey] : EDITOR_ERROR_MESSAGES.failed)[locale];
}

export class EditorApiError extends Error {
  constructor(
    readonly key: EditorErrorKey,
    readonly code?: string,
  ) {
    super(EDITOR_ERROR_MESSAGES[key].en);
    this.name = 'EditorApiError';
  }
}

async function authHeader(): Promise<string> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    throw new EditorApiError('sign_in');
  }
  return `Bearer ${token}`;
}

async function editorFetch(path: string, init: RequestInit = {}, timeoutMs?: number): Promise<Response> {
  return fetchWithTimeout(`${editorBaseUrl()}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      Authorization: await authHeader(),
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  }, fetch, timeoutMs);
}

/** A lost write response cannot tell us whether the service committed the action. */
async function editorWrite<T>(path: string, init: RequestInit, fallback: EditorErrorKey, timeoutMs?: number): Promise<T> {
  try {
    const response = await editorFetch(path, init, timeoutMs);
    await throwIfNotOk(response, fallback);
    return await response.json() as T;
  } catch (error) {
    if (error instanceof EditorApiError) throw error;
    throw new EditorApiError(fallback === 'publish_failed' ? 'publish_unconfirmed' : 'request_unconfirmed');
  }
}

async function throwIfNotOk(response: Response, fallback: EditorErrorKey): Promise<void> {
  if (response.ok) {
    return;
  }
  let code: string | undefined;
  let detail: string | undefined;
  try {
    const body = (await response.json()) as { error?: string; code?: string };
    code = body.code;
    detail = body.error;
  } catch {
    // Keep status-based messages when the body is not JSON.
  }
  if (fallback === 'publish_failed') {
    console.error('Editor publish API failed', { status: response.status, code, detail });
  }
  if (response.status === 401) {
    throw new EditorApiError('sign_in', code);
  }
  if (response.status === 403 && code === 'step_up_required') {
    throw new EditorApiError('step_up', code);
  }
  if (response.status === 403) {
    throw new EditorApiError('forbidden', code);
  }
  if (response.status === 409) {
    throw new EditorApiError(code === 'not_tip' || code === 'not_editorial_tip' || code === 'not_legal_tip' ? code : 'not_ready', code);
  }
  if (response.status === 400) {
    throw new EditorApiError('invalid', code);
  }
  if (fallback === 'publish_failed' && [502, 503, 504].includes(response.status)) {
    throw new EditorApiError('publish_unconfirmed', code);
  }
  throw new EditorApiError(fallback, code);
}

export async function openSession(versionId: string, hopKind: 'legal' | 'editorial_correction'): Promise<EditSession> {
  return editorWrite<EditSession>('/edit-sessions', {
    method: 'POST',
    body: JSON.stringify({ versionId, hopKind }),
  }, 'open_failed');
}

export async function listSessions(filters: {
  status?: string;
  openedBy?: string;
  versionId?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<EditSessionSummary[]> {
  const params = new URLSearchParams();
  if (filters.status) {
    params.set('status', filters.status);
  }
  if (filters.openedBy) {
    params.set('openedBy', filters.openedBy);
  }
  if (filters.versionId) {
    params.set('versionId', filters.versionId);
  }
  if (filters.limit != null) params.set('limit', String(filters.limit));
  if (filters.offset != null) params.set('offset', String(filters.offset));
  const query = params.toString();
  const response = await editorFetch(query ? `/edit-sessions?${query}` : '/edit-sessions');
  await throwIfNotOk(response, 'list_failed');
  return (await response.json()) as EditSessionSummary[];
}

export async function listAllSessions(filters: { status?: string; openedBy?: string; versionId?: string } = {}): Promise<EditSessionSummary[]> {
  const sessions: EditSessionSummary[] = [];
  const limit = 100;
  for (let offset = 0; ; offset += limit) {
    const page = await listSessions({ ...filters, limit, offset });
    sessions.push(...page);
    if (page.length < limit) return sessions;
  }
}

export async function getDraftPreview(sessionId: string): Promise<DraftPreview | null> {
  const response = await editorFetch(`/edit-sessions/${encodeURIComponent(sessionId)}`);
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as DraftPreview;
}

export async function saveDraft(
  sessionId: string,
  articleId: string,
  title: string,
  body: string,
): Promise<DraftPreview> {
  return editorWrite<DraftPreview>(`/edit-sessions/${encodeURIComponent(sessionId)}/saves`, {
    method: 'POST',
    body: JSON.stringify({ articleId, title, body }),
  }, 'save_failed');
}

export async function submitReview(sessionId: string): Promise<DraftPreview> {
  return editorWrite<DraftPreview>(`/edit-sessions/${encodeURIComponent(sessionId)}/review`, {
    method: 'POST',
  }, 'review_failed');
}

export async function approveReview(sessionId: string): Promise<DraftPreview> {
  return editorWrite<DraftPreview>(`/edit-sessions/${encodeURIComponent(sessionId)}/approval`, {
    method: 'POST',
  }, 'approve_failed');
}

export async function savePublishDetails(
  sessionId: string,
  details: { comment?: string; changeRecord?: { title: string; comment: string; documents: { url: string; label?: string }[]; changes?: ChangeRecordChange[] } },
): Promise<DraftPreview> {
  return editorWrite<DraftPreview>(`/edit-sessions/${encodeURIComponent(sessionId)}/publish-details`, {
    method: 'POST',
    body: JSON.stringify(details),
  }, 'save_failed');
}

export async function publishSession(
  sessionId: string,
  options: { hopKind: 'legal' | 'editorial_correction'; amendmentId?: string; comment?: string; changeRecord?: { title: string; comment: string; documents: { url: string; label?: string }[]; changes?: ChangeRecordChange[] } },
): Promise<DraftPreview> {
  return editorWrite<DraftPreview>(`/edit-sessions/${encodeURIComponent(sessionId)}/publish`, {
    method: 'POST',
    body: JSON.stringify(options),
  }, 'publish_failed', PUBLISH_TIMEOUT_MS);
}

export async function getStructuredDraft(sessionId: string): Promise<import('./structured-editor').StructuredPreview | null> {
  const response = await editorFetch(`/edit-sessions/${encodeURIComponent(sessionId)}/structured-draft`);
  if (response.status === 404) return null;
  await throwIfNotOk(response, 'save_failed');
  return response.json();
}
export async function saveStructuredDraft(sessionId: string, request: { expectedGeneration: number; operations: import('./structured-editor').DraftOperation[] }): Promise<import('./structured-editor').StructuredPreview> {
  return editorWrite<import('./structured-editor').StructuredPreview>(`/edit-sessions/${encodeURIComponent(sessionId)}/structured-saves`, { method: 'POST', body: JSON.stringify(request) }, 'save_failed');
}

export async function getEditorDiffReview(sessionId: string): Promise<DiffReviewState> {
  const response = await editorFetch(`/edit-sessions/${encodeURIComponent(sessionId)}/diff-review`);
  await throwIfNotOk(response, 'review_failed');
  return response.json();
}

export async function decideEditorDiff(sessionId: string, generation: number, decision: ReviewDecisionInput): Promise<DiffReviewState> {
  return editorWrite<DiffReviewState>(`/edit-sessions/${encodeURIComponent(sessionId)}/diff-review/decisions`, {
    method: 'POST',
    body: JSON.stringify({
      expectedGeneration: generation,
      key: decision.key,
      fingerprint: decision.fingerprint,
      status: decision.status,
      linkedRowIds: decision.linkedIds ?? [],
      exclusionReason: decision.exclusionReason ?? null,
      reviewerAcknowledged: decision.reviewerAcknowledged ?? false,
    }),
  }, 'save_failed');
}
