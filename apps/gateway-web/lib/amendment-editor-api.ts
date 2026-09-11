import { cookies } from 'next/headers';
import type { Amendment } from './api';
import { amendmentBaseUrl } from './api';
import { SESSION_COOKIE } from './session';

export type AmendmentChangeWrite = {
  articleNumber?: string | null;
  changeType: string;
  note?: string | null;
};

export type AmendmentWriteBody = {
  kind?: string;
  title: string;
  summary?: string | null;
  enactedOn?: string | null;
  effectiveOn?: string | null;
  sourceReference?: string | null;
  sourceVersionId?: string | null;
  targetVersionId?: string | null;
  changes: AmendmentChangeWrite[];
};

export type AmendmentRevision = AmendmentWriteBody & {
  id: string;
  predecessorRevisionId?: string | null;
  createdBy?: string | null;
  createdAt: string;
};

export type SuggestedChange = AmendmentChangeWrite & {
  nodeId?: string | null;
  articleId?: string | null;
};

export type SuggestChangesBody = {
  sourceVersionId: string;
  targetVersionId: string;
};

export const AMENDMENT_ERROR_MESSAGES = {
  sign_in: 'Sign in required.',
  forbidden: 'You do not have permission for that action.',
  not_found: 'This amending law could not be found.',
  invalid: 'The amending law could not be saved.',
  create_failed: 'Could not create amending law.',
  save_failed: 'Could not save draft.',
  publish_failed: 'Could not publish amending law.',
  withdraw_failed: 'Could not withdraw amending law.',
  title: 'Title is required.',
  failed: 'The amending law action could not be completed.',
} as const;

export type AmendmentErrorKey = keyof typeof AMENDMENT_ERROR_MESSAGES;

export function amendmentErrorMessage(key: string | undefined): string | null {
  if (!key) {
    return null;
  }
  return key in AMENDMENT_ERROR_MESSAGES
    ? AMENDMENT_ERROR_MESSAGES[key as AmendmentErrorKey]
    : AMENDMENT_ERROR_MESSAGES.failed;
}

export class AmendmentApiError extends Error {
  constructor(
    readonly key: AmendmentErrorKey,
    readonly code?: string,
  ) {
    super(AMENDMENT_ERROR_MESSAGES[key]);
    this.name = 'AmendmentApiError';
  }
}

async function authHeader(): Promise<string> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    throw new AmendmentApiError('sign_in');
  }
  return `Bearer ${token}`;
}

async function amendmentFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${amendmentBaseUrl()}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      Authorization: await authHeader(),
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

async function throwIfNotOk(response: Response, fallback: AmendmentErrorKey): Promise<void> {
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
    throw new AmendmentApiError('sign_in', code);
  }
  if (response.status === 403) {
    throw new AmendmentApiError('forbidden', code);
  }
  if (response.status === 404) {
    throw new AmendmentApiError('not_found', code);
  }
  if (response.status === 400) {
    throw new AmendmentApiError('invalid', code);
  }
  throw new AmendmentApiError(fallback, code);
}

export async function getAmendment(id: string): Promise<Amendment | null> {
  const response = await amendmentFetch(`/amendments/${encodeURIComponent(id)}`);
  if (response.status === 404) {
    return null;
  }
  await throwIfNotOk(response, 'not_found');
  return (await response.json()) as Amendment;
}

export async function createAmendment(constitutionId: string, body: AmendmentWriteBody): Promise<Amendment> {
  const response = await amendmentFetch(`/constitutions/${encodeURIComponent(constitutionId)}/amendments`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  await throwIfNotOk(response, 'create_failed');
  return (await response.json()) as Amendment;
}

export async function appendRevision(amendmentId: string, body: AmendmentWriteBody): Promise<Amendment> {
  const response = await amendmentFetch(`/amendments/${encodeURIComponent(amendmentId)}/revisions`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  await throwIfNotOk(response, 'save_failed');
  return (await response.json()) as Amendment;
}

export async function publishAmendment(amendmentId: string): Promise<Amendment> {
  const response = await amendmentFetch(`/amendments/${encodeURIComponent(amendmentId)}/publish`, {
    method: 'POST',
  });
  await throwIfNotOk(response, 'publish_failed');
  return (await response.json()) as Amendment;
}

export async function withdrawAmendment(amendmentId: string): Promise<Amendment> {
  const response = await amendmentFetch(`/amendments/${encodeURIComponent(amendmentId)}/withdraw`, {
    method: 'POST',
  });
  await throwIfNotOk(response, 'withdraw_failed');
  return (await response.json()) as Amendment;
}

export async function listRevisions(amendmentId: string): Promise<AmendmentRevision[] | null> {
  let response: Response;
  try {
    response = await amendmentFetch(`/amendments/${encodeURIComponent(amendmentId)}/revisions`);
  } catch (error) {
    if (error instanceof AmendmentApiError && (error.key === 'sign_in' || error.key === 'forbidden')) {
      return null;
    }
    throw error;
  }
  if (response.status === 401 || response.status === 403) {
    return null;
  }
  await throwIfNotOk(response, 'not_found');
  return (await response.json()) as AmendmentRevision[];
}

export async function suggestChanges(body: SuggestChangesBody): Promise<{ changes: SuggestedChange[] }> {
  const response = await amendmentFetch('/amendments/suggest', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  await throwIfNotOk(response, 'failed');
  return (await response.json()) as { changes: SuggestedChange[] };
}
