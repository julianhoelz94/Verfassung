import { createHmac } from 'node:crypto';

const deploymentOrigins = {
  test: 'https://tst.verfassungen.julianhoelz.de',
  prod: 'https://verfassungen.julianhoelz.de',
};

export function prepopulateTarget(env) {
  const baseUrl = new URL(env.PREPOPULATE_BASE_URL || 'http://127.0.0.1');
  if (baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash || baseUrl.pathname !== '/') {
    throw new Error('PREPOPULATE_BASE_URL must be a bare origin');
  }
  if (env.PREPOPULATE_DEPLOYMENT_ENVIRONMENT) {
    if (baseUrl.origin !== deploymentOrigins[env.PREPOPULATE_DEPLOYMENT_ENVIRONMENT]) {
      throw new Error('Prepopulate origin does not match the selected deployment environment');
    }
    for (const setting of ['PREPOPULATE_ADMIN_EMAIL', 'PREPOPULATE_ADMIN_PASSWORD', 'PREPOPULATE_TOTP_SECRET']) {
      if (!env[setting]) throw new Error(`Set ${setting}`);
    }
  } else if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(baseUrl.hostname) || env.PREPOPULATE_TEST_STACK !== 'true') {
    throw new Error('prepopulate requires an explicit localhost test stack or a selected deployment environment');
  }
  return baseUrl;
}

function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of secret.toUpperCase().replace(/=|\s/g, '')) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) throw new Error('Invalid TOTP secret');
    value = (value << 5) | digit;
    bits += 5;
    if (bits >= 8) { bytes.push((value >> (bits - 8)) & 255); bits -= 8; }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const offset = digest[19] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}

export async function authenticateFixtures(api, env, extended = false) {
  const remote = Boolean(env.PREPOPULATE_DEPLOYMENT_ENVIRONMENT);
  const password = env.PREPOPULATE_ADMIN_PASSWORD || (remote ? undefined : env.CI_ADMIN_PASSWORD || env.LOCAL_ADMIN_PASSWORD);
  const secret = env.PREPOPULATE_TOTP_SECRET || (remote ? undefined : env.IDENTITY_SEED_TOTP_SECRET || (env.LOCAL_ADMIN_EMAIL ? 'CAATLASMFASEED22' : undefined));
  async function login(role) {
    const email = env[`PREPOPULATE_${role}_EMAIL`] || (remote ? undefined :
      env[`CI_${role}_EMAIL`] || env[`LOCAL_${role}_EMAIL`] || (role !== 'ADMIN' ? `${env.CI_ADMIN_EMAIL ? 'ci' : 'local'}-${role.toLowerCase()}@example.local` : undefined));
    const accountPassword = env[`PREPOPULATE_${role}_PASSWORD`] || (remote ? undefined : env[`CI_${role}_PASSWORD`] || env[`LOCAL_${role}_PASSWORD`] || password);
    const accountSecret = role === 'ADMIN' ? secret : env[`PREPOPULATE_${role}_TOTP_SECRET`] || (remote ? undefined : secret);
    if (!email || !accountPassword) throw new Error(`Set prepopulate ${role.toLowerCase()} credentials`);
    let session = await api('POST', 'identity/login', { email, password: accountPassword });
    if (session.mfaRequired) {
      if (!accountSecret) throw new Error(`Set the prepopulate ${role.toLowerCase()} TOTP secret`);
      session = await api('POST', 'identity/login/mfa', { challengeToken: session.challengeToken, code: totp(accountSecret) });
    }
    if (!session.token) throw new Error(`Prepopulate ${role.toLowerCase()} login returned no session token`);
    return session.token;
  }
  const token = await login('ADMIN');
  // CD uses the existing administrator. CI retains actual restricted-role accounts.
  if (remote) return { token, reviewerToken: token, publisherToken: token, ...(extended ? { editorToken: token, viewerToken: false } : {}) };
  return { token, reviewerToken: await login('REVIEWER'), publisherToken: await login('PUBLISHER'), ...(extended ? { editorToken: await login('EDITOR'), viewerToken: await login('VIEWER') } : {}) };
}

export async function requireCompletedFixtureSetup(api) {
  const setup = await api('GET', 'identity/setup/status');
  if (setup.completed !== true) throw new Error('Complete the site setup wizard before running prepopulate.');
}
