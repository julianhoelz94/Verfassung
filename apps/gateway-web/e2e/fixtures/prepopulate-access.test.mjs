import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepopulateTarget, authenticateFixtures, requireCompletedFixtureSetup } from './prepopulate-access.mjs';

const remote = {
  PREPOPULATE_DEPLOYMENT_ENVIRONMENT: 'test',
  PREPOPULATE_BASE_URL: 'https://tst.verfassungen.julianhoelz.de',
  PREPOPULATE_ADMIN_EMAIL: 'admin@example.org', PREPOPULATE_ADMIN_PASSWORD: 'admin-password',
  PREPOPULATE_REVIEWER_EMAIL: 'review@example.org', PREPOPULATE_REVIEWER_PASSWORD: 'review-password',
  PREPOPULATE_PUBLISHER_EMAIL: 'publish@example.org', PREPOPULATE_PUBLISHER_PASSWORD: 'publish-password',
};

test('deployment fixture import accepts only the selected canonical HTTPS origin and separate accounts', () => {
  assert.equal(prepopulateTarget(remote).origin, remote.PREPOPULATE_BASE_URL);
  assert.throws(() => prepopulateTarget({ ...remote, PREPOPULATE_BASE_URL: 'https://verfassungen.julianhoelz.de' }), /match/);
  assert.throws(() => prepopulateTarget({ ...remote, PREPOPULATE_BASE_URL: remote.PREPOPULATE_BASE_URL + '/other' }), /origin/);
  assert.throws(() => prepopulateTarget({ ...remote, PREPOPULATE_REVIEWER_EMAIL: remote.PREPOPULATE_ADMIN_EMAIL }), /separate/);
  assert.throws(() => prepopulateTarget({ ...remote, PREPOPULATE_PUBLISHER_PASSWORD: '' }), /PUBLISHER/);
  assert.throws(() => prepopulateTarget({ PREPOPULATE_TEST_STACK: 'true', PREPOPULATE_BASE_URL: remote.PREPOPULATE_BASE_URL }), /localhost/);
});

test('localhost fixture behavior remains opt in', () => {
  assert.equal(prepopulateTarget({ PREPOPULATE_TEST_STACK: 'true' }).origin, 'http://127.0.0.1');
  assert.throws(() => prepopulateTarget({}), /localhost/);
});

test('remote login uses separate credentials and each account own MFA secret', async () => {
  const calls = [];
  const api = async (method, path, body) => {
    calls.push({ path, body });
    if (path.endsWith('/mfa')) return { token: body.challengeToken };
    return { mfaRequired: true, challengeToken: body.email };
  };
  const tokens = await authenticateFixtures(api, { ...remote, PREPOPULATE_TOTP_SECRET: 'CAATLASMFASEED22',
    PREPOPULATE_REVIEWER_TOTP_SECRET: 'JBSWY3DPEHPK3PXP', PREPOPULATE_PUBLISHER_TOTP_SECRET: 'GEZDGNBVGY3TQOJQ' });
  assert.equal(tokens.token, remote.PREPOPULATE_ADMIN_EMAIL);
  assert.equal(tokens.reviewerToken, remote.PREPOPULATE_REVIEWER_EMAIL);
  assert.equal(tokens.publisherToken, remote.PREPOPULATE_PUBLISHER_EMAIL);
  assert.deepEqual(calls.filter(call => call.path === 'identity/login').map(call => call.body.password), ['admin-password', 'review-password', 'publish-password']);
  assert.equal(calls.filter(call => call.path.endsWith('/mfa')).length, 3);
  await assert.rejects(authenticateFixtures(api, remote), /administrator|admin.*TOTP/);
});

test('existing CI credentials still work without deployment variables', async () => {
  const tokens = await authenticateFixtures(async (method, path, body) => ({ token: body.email }), {
    CI_ADMIN_EMAIL: 'ci-admin@example.local', CI_ADMIN_PASSWORD: 'ci-pass',
  });
  assert.equal(tokens.reviewerToken, 'ci-reviewer@example.local');
  assert.equal(tokens.publisherToken, 'ci-publisher@example.local');
});


test('all fixture targets require completed deployment setup before non-admin logins', async () => {
  const calls = [];
  await requireCompletedFixtureSetup(async (method, path) => { calls.push([method, path]); return { completed: true }; });
  assert.deepEqual(calls, [['GET', 'identity/setup/status']]);
  await assert.rejects(requireCompletedFixtureSetup(async () => ({ completed: false })), /Complete the site setup wizard/);
});
