import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixtureVersion, publishFixture } from './prepopulate-import.mjs';

const payload = { isoCode: 'XA', constitutionSlug: 'atlas-charter', versionLabel: '2020', articles: [{ articleNumber: '1', body: 'Dignity.' }] };

function fixtureApi(initialJob, staged = payload) {
  const calls = [];
  const job = initialJob ?? { id: 'new-job', status: 'pending_review', versionId: null };
  const api = async (method, path, body, credential, headers) => {
    calls.push({ method, path, credential, headers });
    if (method === 'GET' && path === 'ingestion/import-jobs') return initialJob ? [initialJob] : [];
    if (path.endsWith('/payload')) return staged;
    if (method === 'GET') return { ...job, status: 'approved' };
    if (path === 'ingestion/import-jobs') return { id: 'new-job', status: 'pending_review', versionId: null };
    if (path.endsWith('/confirm-outline')) return job;
    if (path.endsWith('/prepare')) return { id: path.split('/')[2], status: 'pending_review', versionId: 'version' };
    if (path.endsWith('/approve')) {
      assert.equal(credential, 'reviewer');
      return { ...job, id: path.split('/')[2], status: 'approved', versionId: 'version' };
    }
    if (path.endsWith('/publish')) {
      assert.equal(credential, 'publisher');
      return { ...job, id: path.split('/')[2], status: 'completed', versionId: 'version' };
    }
    throw Error(`Unexpected ${method} ${path}`);
  };
  return { calls, context: { api, pause: async () => {}, reviewerToken: 'reviewer', publisherToken: 'publisher' } };
}

const run = (context) => publishFixture(context, { key: 'xa-2020' }, payload, payload, false);

test('preparation leaves pending_review with a version ID; separate roles approve and publish it', async () => {
  const { calls, context } = fixtureApi();
  assert.equal((await run(context)).status, 'completed');
  assert.deepEqual(calls.filter(call => call.method === 'POST').map(call => call.path), [
    'ingestion/import-jobs', 'ingestion/import-jobs/new-job/confirm-outline',
    'ingestion/import-jobs/new-job/prepare', 'ingestion/import-jobs/new-job/approve',
    'ingestion/import-jobs/new-job/publish',
  ]);
  assert.equal(calls.find(call => call.headers)?.headers['Idempotency-Key'], 'atlas-fixture-xa-2020');
});

test('an interrupted prepared fixture resumes without creating or preparing another draft', async () => {
  const { calls, context } = fixtureApi({ id: 'saved-job', status: 'pending_review', versionId: 'version', isoCode: 'XA' });
  await run(context);
  assert.deepEqual(calls.filter(call => call.method === 'POST').map(call => call.path), [
    'ingestion/import-jobs/saved-job/approve', 'ingestion/import-jobs/saved-job/publish',
  ]);
});

test('an uncertain publication waits for reconciliation before submitting publication once', async () => {
  const { calls, context } = fixtureApi({ id: 'saved-job', status: 'publishing', versionId: 'version', isoCode: 'XA' });
  await run(context);
  assert.equal(calls.filter(call => call.path.endsWith('/publish')).length, 1);
  assert.equal(calls.filter(call => call.path.endsWith('/approve')).length, 0);
  assert.ok(calls.some(call => call.method === 'GET' && call.path.endsWith('/saved-job')));
});

test('a draft with different source content is never automatically reviewed or published', async () => {
  const { calls, context } = fixtureApi({ id: 'unrelated', status: 'approved', isoCode: 'XA' }, {
    ...payload, articles: [{ articleNumber: '1', body: 'Different staff draft.' }],
  });
  await run(context);
  assert.ok(!calls.some(call => call.method === 'POST' && call.path.includes('/unrelated/')));
});

test('fixture identity stays on the legal snapshot after a public editorial correction', () => {
  const found = fixtureVersion([{ id: 'correction', legalVersionId: 'original', currentVersionId: 'correction', versionLabel: '2020' }], '2020');
  assert.equal(found.id, 'original');
  assert.equal(found.currentVersionId, 'correction');
  assert.equal(fixtureVersion([], '2020'), undefined);
});
