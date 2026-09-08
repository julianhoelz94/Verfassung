import { cookies } from 'next/headers';
import { SESSION_COOKIE } from './session';

export function editorBaseUrl(): string {
  return process.env.EDITOR_API_URL ?? 'http://localhost/api/editor';
}

export type EditSession = {
  id: string;
  actorId: string;
  versionId: string;
  status: string;
  revisionCount: number;
};

export type EditSessionSummary = {
  id: string;
  versionId: string;
  status: string;
  openedBy: string;
  openedAt: string;
  updatedAt: string;
  changedArticleCount: number;
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
};

/**
 * Fixed editor error copy keyed by a short identifier. Server actions redirect with
 * `?error=<key>` and the editor page renders only these strings, so a crafted URL cannot
 * put arbitrary text into the trusted error banner.
 */
export const EDITOR_ERROR_MESSAGES = {
  sign_in: 'Sign in required.',
  step_up: 'Recent authenticator confirmation is required.',
  forbidden: 'You do not have permission for that action.',
  not_ready: 'This draft is not ready for that action.',
  invalid: 'The draft could not be published.',
  open_failed: 'Could not open an edit session.',
  list_failed: 'Could not list edit sessions.',
  save_failed: 'Could not save draft.',
  review_failed: 'Could not submit for review.',
  approve_failed: 'Could not approve this draft.',
  publish_failed: 'Could not publish.',
  session_id: 'Enter a session id.',
  title: 'The section title could not be saved.',
  failed: 'The editor action could not be completed.',
} as const;

export type EditorErrorKey = keyof typeof EDITOR_ERROR_MESSAGES;

export function editorErrorMessage(key: string | undefined): string | null {
  if (!key) {
    return null;
  }
  return key in EDITOR_ERROR_MESSAGES ? EDITOR_ERROR_MESSAGES[key as EditorErrorKey] : EDITOR_ERROR_MESSAGES.failed;
}

export class EditorApiError extends Error {
  constructor(
    readonly key: EditorErrorKey,
    readonly code?: string,
  ) {
    super(EDITOR_ERROR_MESSAGES[key]);
    this.name = 'EditorApiError';
  }
}

function authHeader(): string {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) {
    throw new EditorApiError('sign_in');
  }
  return `Bearer ${token}`;
}

async function editorFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${editorBaseUrl()}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

async function throwIfNotOk(response: Response, fallback: EditorErrorKey): Promise<void> {
  if (response.ok) {
    return;
  }
  let code: string | undefined;
  try {
    const body = (await response.json()) as { error?: string; code?: string };
    code = body.code;
  } catch {
    // Keep status-based messages when the body is not JSON.
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
    throw new EditorApiError('not_ready', code);
  }
  if (response.status === 400) {
    throw new EditorApiError('invalid', code);
  }
  throw new EditorApiError(fallback, code);
}

export async function openSession(versionId: string): Promise<EditSession> {
  const response = await editorFetch('/edit-sessions', {
    method: 'POST',
    body: JSON.stringify({ versionId }),
  });
  await throwIfNotOk(response, 'open_failed');
  return (await response.json()) as EditSession;
}

export async function listSessions(filters: {
  status?: string;
  openedBy?: string;
  versionId?: string;
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
  const query = params.toString();
  const response = await editorFetch(query ? `/edit-sessions?${query}` : '/edit-sessions');
  await throwIfNotOk(response, 'list_failed');
  return (await response.json()) as EditSessionSummary[];
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
  const response = await editorFetch(`/edit-sessions/${encodeURIComponent(sessionId)}/saves`, {
    method: 'POST',
    body: JSON.stringify({ articleId, title, body }),
  });
  await throwIfNotOk(response, 'save_failed');
  return (await response.json()) as DraftPreview;
}

export async function submitReview(sessionId: string): Promise<DraftPreview> {
  const response = await editorFetch(`/edit-sessions/${encodeURIComponent(sessionId)}/review`, {
    method: 'POST',
  });
  await throwIfNotOk(response, 'review_failed');
  return (await response.json()) as DraftPreview;
}

export async function approveReview(sessionId: string): Promise<DraftPreview> {
  const response = await editorFetch(`/edit-sessions/${encodeURIComponent(sessionId)}/approval`, {
    method: 'POST',
  });
  await throwIfNotOk(response, 'approve_failed');
  return (await response.json()) as DraftPreview;
}

export async function publishSession(sessionId: string): Promise<DraftPreview> {
  const response = await editorFetch(`/edit-sessions/${encodeURIComponent(sessionId)}/publish`, {
    method: 'POST',
  });
  await throwIfNotOk(response, 'publish_failed');
  return (await response.json()) as DraftPreview;
}
