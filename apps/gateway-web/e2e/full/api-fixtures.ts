import { randomUUID } from 'node:crypto';
import { expect, type APIRequestContext } from '@playwright/test';
import { authenticatorCode } from './auth';

async function expectJson(response: Awaited<ReturnType<APIRequestContext['post']>>, label: string) {
  const body = await response.json();
  expect(response.ok(), `${label}: HTTP ${response.status()} ${JSON.stringify(body)}`).toBeTruthy();
  return body;
}

export async function adminHeaders(request: APIRequestContext) {
  const login = await expectJson(await request.post('/api/identity/login', { data: {
    email: process.env.CI_ADMIN_EMAIL ?? 'ci-admin@example.local',
    password: process.env.CI_ADMIN_PASSWORD ?? 'change-me',
  } }), 'admin login');
  const authenticated = login.mfaRequired
    ? await expectJson(await request.post('/api/identity/login/mfa', { data: {
      challengeToken: login.challengeToken,
      code: authenticatorCode(process.env.IDENTITY_SEED_TOTP_SECRET ?? 'CAATLASMFASEED22'),
    } }), 'admin MFA')
    : login;
  expect(authenticated.token).toBeTruthy();
  return { Authorization: `Bearer ${authenticated.token}` };
}

export async function createIsolatedConstitution(request: APIRequestContext, title: string) {
  const headers = await adminHeaders(request);
  const slug = `journey-${randomUUID()}`;
  const base = {
    isoCode: 'XA', countryName: 'Atlas Testland', constitutionSlug: slug, constitutionTitle: title,
    languageCode: 'en',
    articles: [{ articleNumber: '1', title: 'Human dignity', body: 'A civic duty protects every person.', sortOrder: 1 }],
  };
  async function importVersion(versionLabel: string, predecessorVersionId?: string) {
    const job = await expectJson(await request.post('/api/ingestion/import-jobs', { headers, data: {
      ...base, versionLabel, effectiveDate: versionLabel === '2020' ? '2020-01-01' : '2022-01-01',
      ...(predecessorVersionId ? { predecessorVersionId, hopKind: 'legal' } : {}),
    } }), `${title} import ${versionLabel}`);
    expect(job.status).toBe('completed');
    expect(job.versionId).toBeTruthy();
    return job.versionId as string;
  }
  const sourceVersionId = await importVersion('2020');
  const targetVersionId = await importVersion('2022', sourceVersionId);
  const country = await (await request.get('/api/catalog/countries/XA')).json();
  const constitution = country.constitutions.find((item: { slug: string }) => item.slug === slug);
  expect(constitution).toBeTruthy();
  return { countryIso: 'XA', constitutionId: constitution.id as string, sourceVersionId, targetVersionId };
}
