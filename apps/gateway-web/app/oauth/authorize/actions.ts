'use server';

import { redirect } from 'next/navigation';
import { identityBaseUrl } from '../../../lib/identity-client';
import { requireSessionBearer } from '../../../lib/session';

const fields = ['client_id', 'redirect_uri', 'resource', 'response_type', 'code_challenge', 'code_challenge_method', 'scope', 'state'] as const;

export async function authorizeClient(form: FormData): Promise<void> {
  const values = Object.fromEntries(fields.map(field => [field, String(form.get(field) ?? '')])) as Record<string, string>;
  const clientQuery = new URLSearchParams({ redirect_uri: values.redirect_uri, resource: values.resource });
  const clientResponse = await fetch(`${identityBaseUrl()}/oauth/clients/${encodeURIComponent(values.client_id)}?${clientQuery}`, { cache: 'no-store' });
  if (!clientResponse.ok) redirect('/account?oauth=invalid');
  if (form.get('decision') === 'deny') {
    const destination = new URL(values.redirect_uri);
    destination.searchParams.set('error', 'access_denied');
    if (values.state) destination.searchParams.set('state', values.state);
    redirect(destination.toString());
  }
  if (form.get('decision') !== 'approve') redirect('/account?oauth=invalid');
  const authorization = await requireSessionBearer();
  const response = await fetch(`${identityBaseUrl()}/oauth/approve`, {
    method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify(values), cache: 'no-store',
  });
  if (!response.ok) {
    const query = new URLSearchParams(values);
    if (response.status === 403 && values.scope.split(' ').includes('ingestion:import')) {
      redirect(`/account/step-up?returnTo=${encodeURIComponent(`/oauth/authorize?${query}`)}`);
    }
    query.set('error', 'permission');
    redirect(`/oauth/authorize?${query}`);
  }
  const body = (await response.json()) as { redirect_uri: string };
  redirect(body.redirect_uri);
}
