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
};

export class EditorApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'EditorApiError';
  }
}

function authHeader(): string {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) {
    throw new EditorApiError('Not signed in');
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

async function throwIfNotOk(response: Response, fallback: string): Promise<void> {
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
    throw new EditorApiError('Sign in required.', code);
  }
  if (response.status === 403 && code === 'step_up_required') {
    throw new EditorApiError('Recent authenticator confirmation is required.', code);
  }
  if (response.status === 403) {
    throw new EditorApiError('You do not have permission for that action.', code);
  }
  if (response.status === 409) {
    throw new EditorApiError('This draft is not ready for that action.', code);
  }
  if (response.status === 400) {
    throw new EditorApiError('The draft could not be published.', code);
  }
  throw new EditorApiError(fallback, code);
}

export async function openSession(versionId: string): Promise<EditSession> {
  const response = await editorFetch('/edit-sessions', {
    method: 'POST',
    body: JSON.stringify({ versionId }),
  });
  await throwIfNotOk(response, 'Could not open an edit session');
  return (await response.json()) as EditSession;
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
  await throwIfNotOk(response, 'Could not save draft');
  return (await response.json()) as DraftPreview;
}

export async function submitReview(sessionId: string): Promise<DraftPreview> {
  const response = await editorFetch(`/edit-sessions/${encodeURIComponent(sessionId)}/review`, {
    method: 'POST',
  });
  await throwIfNotOk(response, 'Could not submit for review');
  return (await response.json()) as DraftPreview;
}

export async function approveReview(sessionId: string): Promise<DraftPreview> {
  const response = await editorFetch(`/edit-sessions/${encodeURIComponent(sessionId)}/approval`, {
    method: 'POST',
  });
  await throwIfNotOk(response, 'Could not approve this draft');
  return (await response.json()) as DraftPreview;
}

export async function publishSession(sessionId: string): Promise<DraftPreview> {
  const response = await editorFetch(`/edit-sessions/${encodeURIComponent(sessionId)}/publish`, {
    method: 'POST',
  });
  await throwIfNotOk(response, 'Could not publish');
  return (await response.json()) as DraftPreview;
}
