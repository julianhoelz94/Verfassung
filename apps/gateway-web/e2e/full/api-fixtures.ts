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

async function roleHeaders(request: APIRequestContext, role: 'reviewer' | 'publisher') {
  const login = await expectJson(await request.post('/api/identity/login', { data: {
    email: process.env[`CI_${role.toUpperCase()}_EMAIL`] ?? `ci-${role}@example.local`,
    password: process.env[`CI_${role.toUpperCase()}_PASSWORD`] ?? 'change-me',
  } }), `${role} login`);
  const authenticated = login.mfaRequired
    ? await expectJson(await request.post('/api/identity/login/mfa', { data: {
      challengeToken: login.challengeToken,
      code: authenticatorCode(process.env.IDENTITY_SEED_TOTP_SECRET ?? 'CAATLASMFASEED22'),
    } }), `${role} MFA`)
    : login;
  expect(authenticated.token).toBeTruthy();
  return { Authorization: `Bearer ${authenticated.token}` };
}

export async function createIsolatedConstitution(request: APIRequestContext, title: string, targetBody?: string) {
  const headers = await adminHeaders(request);
  const reviewer = await roleHeaders(request, 'reviewer');
  const publisher = await roleHeaders(request, 'publisher');
  const slug = `journey-${randomUUID()}`;
  const base = {
    isoCode: 'XA', countryName: 'Atlas Testland', constitutionSlug: slug, constitutionTitle: title,
    languageCode: 'en',
    outline: { kinds: [{ kindCode: 'article', displayLabel: 'Article' }] },
    articles: [{ articleNumber: '1', title: 'Human dignity', body: 'A civic duty protects every person.', sortOrder: 1 }],
  };
  async function importVersion(versionLabel: string, predecessorVersionId?: string) {
    const detail = await (await request.get('/api/catalog/countries/XA')).json();
    const constitution = detail.constitutions.find((item: { slug: string }) => item.slug === slug);
    const settings = constitution ? await (await request.get(`/api/catalog/constitutions/${constitution.id}/settings`)).json() : null;
    const job = await expectJson(await request.post('/api/ingestion/import-jobs', { headers, data: {
      ...base, versionLabel, effectiveDate: versionLabel === '2020' ? '2020-01-01' : '2022-01-01',
      ...(settings ? { outline: undefined, constitutionId: constitution.id, settingsRevisionId: settings.id } : {}),
      articles: versionLabel === '2022' && targetBody ? [{ ...base.articles[0], body: targetBody }] : base.articles,
      ...(predecessorVersionId ? { predecessorVersionId, hopKind: 'legal' } : {}),
    } }), `${title} import ${versionLabel}`);
    expect(job.status).toBe('pending_review');
    if (!settings) await expectJson(await request.post(`/api/ingestion/import-jobs/${job.id}/confirm-outline`, { headers }), 'confirm fixture outline');
    await expectJson(await request.post(`/api/ingestion/import-jobs/${job.id}/prepare`, { headers }), 'prepare fixture draft');
    await expectJson(await request.post(`/api/ingestion/import-jobs/${job.id}/approve`, { headers: reviewer, data: { reason: 'Fixture source and structure checked against the generated text.' } }), 'approve fixture draft');
    const published = await expectJson(await request.post(`/api/ingestion/import-jobs/${job.id}/publish`, { headers: publisher }), 'publish fixture draft');
    expect(published.status).toBe('completed');
    expect(published.versionId).toBeTruthy();
    return published.versionId as string;
  }
  const sourceVersionId = await importVersion('2020');
  const targetVersionId = await importVersion('2022', sourceVersionId);
  const country = await (await request.get('/api/catalog/countries/XA')).json();
  const constitution = country.constitutions.find((item: { slug: string }) => item.slug === slug);
  expect(constitution).toBeTruthy();
  return { countryIso: 'XA', constitutionId: constitution.id as string, sourceVersionId, targetVersionId };
}
