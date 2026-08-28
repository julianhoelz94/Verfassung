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

export type DraftPreview = {
  session: EditSession;
  latestSnapshot: string | null;
};

function authHeader(): string {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) {
    throw new Error('Not signed in');
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

export async function openSession(versionId: string): Promise<EditSession> {
  const response = await editorFetch('/edit-sessions', {
    method: 'POST',
    body: JSON.stringify({ versionId }),
  });
  if (!response.ok) {
    throw new Error('Could not open an edit session');
  }
  return (await response.json()) as EditSession;
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
  if (!response.ok) {
    throw new Error('Could not save draft');
  }
  return (await response.json()) as DraftPreview;
}

export async function submitReview(sessionId: string): Promise<DraftPreview> {
  const response = await editorFetch(`/edit-sessions/${encodeURIComponent(sessionId)}/review`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Could not submit for review');
  }
  return (await response.json()) as DraftPreview;
}

export async function publishSession(sessionId: string): Promise<DraftPreview> {
  const response = await editorFetch(`/edit-sessions/${encodeURIComponent(sessionId)}/publish`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Could not publish');
  }
  return (await response.json()) as DraftPreview;
}
