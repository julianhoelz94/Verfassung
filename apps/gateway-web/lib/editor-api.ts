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
  constructor(message: string) {
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

function throwIfNotOk(response: Response, fallback: string): void {
  if (response.ok) {
    return;
  }
  if (response.status === 401) {
    throw new EditorApiError('Sign in required.');
  }
  if (response.status === 403) {
    throw new EditorApiError('You do not have permission for that action.');
  }
  if (response.status === 409) {
    throw new EditorApiError('This draft is not ready for that action.');
  }
  if (response.status === 400) {
    throw new EditorApiError('The draft could not be published.');
  }
  throw new EditorApiError(fallback);
}

export async function openSession(versionId: string): Promise<EditSession> {
  const response = await editorFetch('/edit-sessions', {
    method: 'POST',
    body: JSON.stringify({ versionId }),
  });
  throwIfNotOk(response, 'Could not open an edit session');
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
  throwIfNotOk(response, 'Could not save draft');
  return (await response.json()) as DraftPreview;
}

export async function submitReview(sessionId: string): Promise<DraftPreview> {
  const response = await editorFetch(`/edit-sessions/${encodeURIComponent(sessionId)}/review`, {
    method: 'POST',
  });
  throwIfNotOk(response, 'Could not submit for review');
  return (await response.json()) as DraftPreview;
}

export async function approveReview(sessionId: string): Promise<DraftPreview> {
  const response = await editorFetch(`/edit-sessions/${encodeURIComponent(sessionId)}/approval`, {
    method: 'POST',
  });
  throwIfNotOk(response, 'Could not approve this draft');
  return (await response.json()) as DraftPreview;
}

export async function publishSession(sessionId: string): Promise<DraftPreview> {
  const response = await editorFetch(`/edit-sessions/${encodeURIComponent(sessionId)}/publish`, {
    method: 'POST',
  });
  throwIfNotOk(response, 'Could not publish');
  return (await response.json()) as DraftPreview;
}
