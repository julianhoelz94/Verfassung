import { describe, expect, test } from 'vitest';
import { reviewFixtures, REVIEW_CURRENT, REVIEW_DOCUMENT, REVIEW_JOB, REVIEW_PROPOSAL } from '../e2e/fixtures/ui-review.mjs';

const country = { id: 'country', constitutions: [{ id: 'constitution', versions: [{ id: 'old' }, { id: 'legal' }] }] };
const proposalPath = `/api/ingestion/import-setup-proposals/${REVIEW_PROPOSAL}`;

/** Exercises the fixture's public request boundary with exact body-read counts. */
function request(fixture: ReturnType<typeof reviewFixtures>, method: string, pathname: string, body?: unknown, revision?: unknown, url = pathname) {
  let reads = 0;
  const result = fixture.response({ url, headers: { 'if-match': revision } }, method, pathname, async () => { reads++; return body; });
  return { result, reads: () => reads };
}

/** Read through the same public dispatcher without supplying or consuming a request body. */
async function get(fixture: ReturnType<typeof reviewFixtures>, pathname: string, url = pathname) {
  return request(fixture, 'GET', pathname, undefined, undefined, url).result;
}

describe('UI review fixture public request contracts', () => {
  test('stages import preparation and status in the shared job projection', async () => {
    const fixture = reviewFixtures(country);
    const staged = request(fixture, 'POST', '/__sprint59_import', { prepared: true, status: 'approved' });
    expect((await staged.result).versionId).toBe(REVIEW_CURRENT);
    expect(staged.reads()).toBe(1);
    expect((await get(fixture, `/api/ingestion/import-jobs/${REVIEW_JOB}`)).status).toBe('approved');
    expect(await get(fixture, '/api/ingestion/import-jobs', '/api/ingestion/import-jobs?status=approved')).toHaveLength(1);
    await request(fixture, 'POST', '/__sprint59_import', {}).result;
    expect((await get(fixture, `/api/ingestion/import-jobs/${REVIEW_JOB}`)).versionId).toBeNull();
    expect((await get(fixture, `/api/ingestion/import-jobs/${REVIEW_JOB}`)).status).toBe('pending_review');
  });

  test('keeps source versions intact while publishing the review correction tip', async () => {
    const input = structuredClone(country);
    const fixture = reviewFixtures(input);
    expect(input).toEqual(country);
    expect(fixture.country.constitutions[0].versions).toEqual([{ id: 'old' }, { id: 'legal', currentVersionId: REVIEW_CURRENT }]);
    expect(fixture.corrections.map(item => [item.id, item.legalVersionId, item.currentVersionId, item.latestPublished])).toEqual([
      ['01900000-0000-4000-8000-000000000803', 'legal', REVIEW_CURRENT, false],
      [REVIEW_CURRENT, 'legal', REVIEW_CURRENT, true],
    ]);
    expect(await get(fixture, `/api/document/documents/${REVIEW_DOCUMENT}/events`)).toEqual([{ id: 'created', eventType: 'created', occurredAt: '2026-01-01T00:00:00Z' }]);
  });

  test('updates shared setup and language state before registration is computed', async () => {
    const fixture = reviewFixtures(country);
    const enabledLanguages = ['de'];
    const preferences = { enabledLanguages, defaultLanguage: 'de', mailDeferred: true };
    const updated = await request(fixture, 'PUT', '/api/identity/setup', preferences).result;
    expect(updated.preferences).toBe(preferences);
    const languages = await get(fixture, '/api/identity/site/languages');
    expect(languages.enabled).toBe(enabledLanguages);
    expect(languages.defaultLanguage).toBe('de');
    expect(await get(fixture, '/api/identity/registration/status')).toEqual({ enabled: false });
    await request(fixture, 'POST', '/__sprint59_setup', { completed: false }).result;
    expect((await get(fixture, '/api/identity/setup')).required).toEqual(['operator-details']);
    await request(fixture, 'POST', '/__sprint59_setup', { completed: true }).result;
    expect((await get(fixture, '/api/identity/setup')).required).toEqual([]);
  });

  test('honors managed registration and retained SMTP secret state across settings writes', async () => {
    const fixture = reviewFixtures(country);
    await request(fixture, 'POST', '/__sprint59_setup', { completed: true, managedRegistration: true, mailDeferred: true }).result;
    expect((await get(fixture, '/api/identity/setup')).settings).toEqual([{ key: 'selfRegistrationEnabled', group: 'access', source: 'environment', optional: true, configured: true, editable: false }]);
    const first = await request(fixture, 'PUT', '/api/identity/admin/settings', { selfRegistrationEnabled: false, smtpPassword: 'new-secret', mailEnabled: false }).result;
    expect(first.selfRegistrationEnabled).toBe(true);
    expect(first.smtpPasswordSet).toBe(true);
    expect(first).not.toHaveProperty('smtpPassword');
    expect(await get(fixture, '/api/identity/registration/status')).toEqual({ enabled: false });
    const second = await request(fixture, 'PUT', '/api/identity/admin/settings', { smtpPassword: '', mailEnabled: true }).result;
    expect(second.smtpPasswordSet).toBe(true);
    expect((await get(fixture, '/api/identity/setup')).preferences.mailDeferred).toBe(false);
    expect(await get(fixture, '/api/identity/registration/status')).toEqual({ enabled: true });
    await request(fixture, 'POST', '/__sprint59_setup', { completed: true, managedRegistration: false }).result;
    await request(fixture, 'PUT', '/api/identity/admin/settings', { selfRegistrationEnabled: false }).result;
    expect(await get(fixture, '/api/identity/registration/status')).toEqual({ enabled: false });
  });

  test('rejects stale revision and non-proposed writes before consuming request bodies', async () => {
    const fixture = reviewFixtures(country);
    const stale = request(fixture, 'POST', `${proposalPath}/display`, { kinds: [] }, undefined);
    expect((await stale.result).status).toBe(409);
    expect(stale.reads()).toBe(0);
    await request(fixture, 'POST', `${proposalPath}/withdraw`, {}, '"1"').result;
    const withdrawn = request(fixture, 'PUT', proposalPath, {}, '1');
    expect((await withdrawn.result).status).toBe(409);
    expect(withdrawn.reads()).toBe(0);
  });

  test('preserves display overrides on revision and keeps a deep previous payload', async () => {
    const fixture = reviewFixtures(country);
    const original = structuredClone((await get(fixture, proposalPath)).payload);
    await request(fixture, 'POST', `${proposalPath}/display`, { kinds: [{ kindCode: 'article', displayLabel: 'Section', showLabel: false }] }, '1').result;
    const revised = structuredClone(original);
    revised.constitutionTitle = 'Revised title';
    revised.outline.kinds[0].displayLabel = 'Ignored label';
    const result = await request(fixture, 'PUT', proposalPath, revised, '"2"').result;
    expect(result.revision).toBe(3);
    expect(result.payload.constitutionTitle).toBe('Revised title');
    expect(result.payload.outline.kinds[0]).toMatchObject({ displayLabel: 'Section', showLabel: false });
    expect(result.previousPayload.outline.kinds[0]).toMatchObject({ displayLabel: 'Section', showLabel: false });
    result.payload.sampleRoots[0].label = 'changed';
    expect(result.previousPayload.sampleRoots[0].label).toBe('1');
    expect(original.outline.kinds[0].displayLabel).toBe('Article');
  });

  test('requires revision after requested changes before confirmation and retains confirmation pins', async () => {
    const fixture = reviewFixtures(country);
    const initial = structuredClone((await get(fixture, proposalPath)).payload);
    const requested = await request(fixture, 'POST', `${proposalPath}/request-changes`, { message: 'Please revise' }, '1').result;
    expect(requested.revision).toBe(2);
    const blocked = request(fixture, 'POST', `${proposalPath}/confirm`, {}, '2');
    expect((await blocked.result).status).toBe(409);
    expect(blocked.reads()).toBe(1);
    await request(fixture, 'PUT', proposalPath, initial, '2').result;
    const confirmed = await request(fixture, 'POST', `${proposalPath}/confirm`, {}, '3').result;
    expect(confirmed).toMatchObject({ status: 'confirmed', revision: 3, changesRequested: false, requestedChanges: 'Please revise', constitutionId: 'constitution', settingsRevisionId: '01900000-0000-4000-8000-000000000901', confirmedBy: '01900000-0000-4000-8000-000000000410' });
  });

  test('reads an unknown proposal action but keeps its state and revision unchanged', async () => {
    const fixture = reviewFixtures(country);
    const before = structuredClone(await get(fixture, proposalPath));
    const unknown = request(fixture, 'POST', `${proposalPath}/unknown`, { ignored: true }, '""1"');
    expect(await unknown.result).toEqual(before);
    expect(unknown.reads()).toBe(1);
    const fresh = await request(fixture, 'POST', '/api/ingestion/import-setup-proposals', before.payload).result;
    expect(fresh).toMatchObject({ status: 'proposed', revision: 1, previousPayload: null, changesRequested: false, requestedChanges: null });
  });

  test('filters jobs by URL status and preserves undefined fallthrough without body reads', async () => {
    const fixture = reviewFixtures(country);
    expect((await get(fixture, '/api/ingestion/import-jobs')).map(job => job.id)).toEqual([REVIEW_JOB]);
    expect(await get(fixture, '/api/ingestion/import-jobs', '/api/ingestion/import-jobs?status=failed')).toEqual([]);
    expect((await get(fixture, '/api/ingestion/import-jobs', '/api/ingestion/import-jobs?status=pending_review')).map(job => job.id)).toEqual([REVIEW_JOB]);
    const unknown = request(fixture, 'DELETE', proposalPath, { ignored: true }, '1');
    expect(await unknown.result).toBeUndefined();
    expect(unknown.reads()).toBe(0);
    expect(await get(fixture, '/unknown', 'http://[')).toBeUndefined();
    await expect(get(fixture, '/api/ingestion/import-jobs', 'http://[')).rejects.toThrow();
  });
});
