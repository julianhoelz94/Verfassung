import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepopulateTarget, authenticateFixtures, requireCompletedFixtureSetup } from './prepopulate-access.mjs';

const remote = {
  PREPOPULATE_DEPLOYMENT_ENVIRONMENT: 'test',
  PREPOPULATE_BASE_URL: 'https://tst.verfassungen.julianhoelz.de',
  PREPOPULATE_ADMIN_EMAIL: 'admin@example.org', PREPOPULATE_ADMIN_PASSWORD: 'admin-password',
  PREPOPULATE_TOTP_SECRET: 'CAATLASMFASEED22',
};

test('deployment fixture import accepts only the selected canonical HTTPS origin and explicit admin credentials', () => {
  assert.equal(prepopulateTarget(remote).origin, remote.PREPOPULATE_BASE_URL);
  assert.throws(() => prepopulateTarget({ ...remote, PREPOPULATE_BASE_URL: 'https://verfassungen.julianhoelz.de' }), /match/);
  assert.throws(() => prepopulateTarget({ ...remote, PREPOPULATE_BASE_URL: remote.PREPOPULATE_BASE_URL + '/other' }), /origin/);
  for (const setting of ['PREPOPULATE_ADMIN_EMAIL', 'PREPOPULATE_ADMIN_PASSWORD', 'PREPOPULATE_TOTP_SECRET']) {
    assert.throws(() => prepopulateTarget({ ...remote, [setting]: '' }), new RegExp(setting));
  }
  assert.throws(() => prepopulateTarget({ PREPOPULATE_TEST_STACK: 'true', PREPOPULATE_BASE_URL: remote.PREPOPULATE_BASE_URL }), /localhost/);
});

test('localhost fixture behavior remains opt in', () => {
  assert.equal(prepopulateTarget({ PREPOPULATE_TEST_STACK: 'true' }).origin, 'http://127.0.0.1');
  assert.throws(() => prepopulateTarget({}), /localhost/);
});

test('CD authenticates the existing admin once and uses that session for every publication stage', async () => {
  const calls = [];
  const api = async (method, path, body) => {
    calls.push({ path, body });
    if (path.endsWith('/mfa')) return { token: body.challengeToken };
    return { mfaRequired: true, challengeToken: body.email };
  };
  const tokens = await authenticateFixtures(api, { ...remote,
    PREPOPULATE_REVIEWER_EMAIL: 'unused-reviewer@example.org', PREPOPULATE_PUBLISHER_EMAIL: 'unused-publisher@example.org' });
  assert.equal(tokens.token, remote.PREPOPULATE_ADMIN_EMAIL);
  assert.equal(tokens.reviewerToken, tokens.token);
  assert.equal(tokens.publisherToken, tokens.token);
  assert.deepEqual(calls.map(call => call.path), ['identity/login', 'identity/login/mfa']);
  assert.equal(calls[0].body.password, 'admin-password');
  assert.match(calls[1].body.code, /^\d{6}$/);
  await assert.rejects(authenticateFixtures(api, { ...remote, PREPOPULATE_TOTP_SECRET: '' }), /admin.*TOTP/);
});

test('CD cannot fall back to local or CI seed credentials', async () => {
  const calls = [];
  const api = async (method, path, body) => {
    calls.push(path);
    return { mfaRequired: true, challengeToken: body.email };
  };
  const env = { ...remote, CI_ADMIN_PASSWORD: 'ci-password', IDENTITY_SEED_TOTP_SECRET: remote.PREPOPULATE_TOTP_SECRET };
  await assert.rejects(authenticateFixtures(api, { ...env, PREPOPULATE_ADMIN_PASSWORD: '' }), /admin.*credentials/);
  assert.deepEqual(calls, []);
  await assert.rejects(authenticateFixtures(api, { ...env, PREPOPULATE_TOTP_SECRET: '' }), /admin.*TOTP/);
  assert.deepEqual(calls, ['identity/login']);
});

test('existing CI credentials still work without deployment variables', async () => {
  const tokens = await authenticateFixtures(async (method, path, body) => ({ token: body.email }), {
    CI_ADMIN_EMAIL: 'ci-admin@example.local', CI_ADMIN_PASSWORD: 'ci-pass',
  }, true);
  assert.equal(tokens.reviewerToken, 'ci-reviewer@example.local');
  assert.equal(tokens.publisherToken, 'ci-publisher@example.local');
  assert.equal(tokens.editorToken, 'ci-editor@example.local');
  assert.equal(tokens.viewerToken, 'ci-viewer@example.local');
});

test('local role accounts retain their separate password and MFA logins', async () => {
  const calls = [];
  const tokens = await authenticateFixtures(async (method, path, body) => {
    calls.push({ path, body });
    return path.endsWith('/mfa') ? { token: body.challengeToken } : { mfaRequired: true, challengeToken: body.email };
  }, {
    LOCAL_ADMIN_EMAIL: 'local-admin@example.local', LOCAL_ADMIN_PASSWORD: 'admin-password',
    PREPOPULATE_REVIEWER_PASSWORD: 'review-password', PREPOPULATE_PUBLISHER_PASSWORD: 'publish-password',
    PREPOPULATE_REVIEWER_TOTP_SECRET: 'JBSWY3DPEHPK3PXP', PREPOPULATE_PUBLISHER_TOTP_SECRET: 'GEZDGNBVGY3TQOJQ',
  });
  assert.equal(tokens.token, 'local-admin@example.local');
  assert.equal(tokens.reviewerToken, 'local-reviewer@example.local');
  assert.equal(tokens.publisherToken, 'local-publisher@example.local');
  assert.deepEqual(calls.filter(call => call.path === 'identity/login').map(call => call.body.password), ['admin-password', 'review-password', 'publish-password']);
  assert.equal(calls.filter(call => call.path.endsWith('/mfa')).length, 3);
});

test('all fixture targets require completed deployment setup before non-admin logins', async () => {
  const calls = [];
  await requireCompletedFixtureSetup(async (method, path) => { calls.push([method, path]); return { completed: true }; });
  assert.deepEqual(calls, [['GET', 'identity/setup/status']]);
  await assert.rejects(requireCompletedFixtureSetup(async () => ({ completed: false })), /Complete the site setup wizard/);
});


test('extended CD scenarios use the admin for editing and no authenticated viewer', async () => {
  const calls = [];
  const tokens = await authenticateFixtures(async (method, path, body) => {
    calls.push(path);
    return { token: body.email };
  }, remote, true);
  assert.equal(tokens.editorToken, tokens.token);
  assert.equal(tokens.reviewerToken, tokens.token);
  assert.equal(tokens.publisherToken, tokens.token);
  assert.equal(tokens.viewerToken, false);
  assert.deepEqual(calls, ['identity/login']);
});
