import { createHmac } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'generated');
const manifest = JSON.parse(readFileSync(join(fixtureDir, 'manifest.json'), 'utf8'));
const verifyOnly = process.argv.includes('--verify-only');
const baseUrl = new URL(process.env.PREPOPULATE_BASE_URL ?? 'http://127.0.0.1');
if (!['127.0.0.1', 'localhost', '::1'].includes(baseUrl.hostname) || process.env.PREPOPULATE_TEST_STACK !== 'true') {
  throw new Error('prepopulate requires PREPOPULATE_TEST_STACK=true and an explicit localhost test stack');
}
const endpoint = (path) => new URL(`/api/${path}`, baseUrl).toString();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let token;

async function api(method, path, body, authenticated = false) {
  const response = await fetch(endpoint(path), {
    method,
    headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(authenticated ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  const value = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status} ${text.slice(0, 1000)}`);
  return value;
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

async function authenticate() {
  const email = process.env.PREPOPULATE_ADMIN_EMAIL ?? process.env.CI_ADMIN_EMAIL;
  const password = process.env.PREPOPULATE_ADMIN_PASSWORD ?? process.env.CI_ADMIN_PASSWORD;
  const secret = process.env.PREPOPULATE_TOTP_SECRET ?? process.env.IDENTITY_SEED_TOTP_SECRET;
  if (!email || !password) throw new Error('Set PREPOPULATE_ADMIN_EMAIL/PASSWORD or CI_ADMIN_EMAIL/PASSWORD');
  let login = await api('POST', 'identity/login', { email, password });
  if (login.mfaRequired) {
    if (!secret) throw new Error('Set PREPOPULATE_TOTP_SECRET for MFA');
    login = await api('POST', 'identity/login/mfa', { challengeToken: login.challengeToken, code: totp(secret) });
  }
  if (!login.token) throw new Error('Admin login returned no session token');
  token = login.token;
}

async function waitForStack() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try { await api('GET', 'catalog/countries'); return; } catch { await pause(2000); }
  }
  throw new Error('Catalog API did not become ready');
}

async function countryDetail(iso) {
  const countries = await api('GET', 'catalog/countries');
  if (!countries.some((country) => country.isoCode === iso)) return null;
  return api('GET', `catalog/countries/${iso}`);
}

function fixture(file) { return JSON.parse(readFileSync(join(fixtureDir, file), 'utf8')); }
function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function assertFields(actual, expected, fields, label) {
  for (const field of fields) assertEqual(actual[field] ?? null, expected[field] ?? null, `${label} ${field}`);
}
function comparableNodes(nodes) {
  return (nodes ?? []).map((node) => ({
    kind: node.kind, label: node.label ?? null, title: node.title ?? null, body: node.body ?? null,
    children: comparableNodes(node.children),
  }));
}

async function verifyArticles(versionId, payload) {
  const articles = await api('GET', `content/versions/${versionId}/articles?includeBody=true&limit=200`);
  assertEqual(articles.length, payload.articles.length, `${payload.isoCode}/${payload.versionLabel} article count`);
  payload.articles.forEach((expected, index) => {
    const actual = articles[index];
    for (const field of ['articleNumber', 'title', 'body', 'sortOrder']) {
      assertEqual(actual[field], expected[field], `${payload.isoCode}/${payload.versionLabel} article ${index + 1} ${field}`);
    }
  });
  for (let index = 0; index < articles.length; index++) {
    if (!payload.articles[index].nodes?.length) continue;
    const detail = await api('GET', `content/articles/${articles[index].id}`);
    assertEqual(JSON.stringify(comparableNodes(detail.children)), JSON.stringify(comparableNodes(payload.articles[index].nodes)),
      `${payload.isoCode}/${payload.versionLabel} article ${index + 1} nested content`);
  }
}

async function ensureVersions(ids) {
  for (const country of manifest.countries) {
    for (const version of country.versions) {
      const payload = fixture(version.file);
      let detail = await countryDetail(country.isoCode);
      let constitution = detail?.constitutions.find((item) => item.slug === country.constitutionSlug);
      let existing = constitution?.versions.find((item) => item.versionLabel === payload.versionLabel);
      if (!existing && !verifyOnly) {
        const request = { ...payload, ...(version.predecessor ? { predecessorVersionId: ids.versions[version.predecessor], hopKind: 'legal' } : {}) };
        const job = await api('POST', 'ingestion/import-jobs', request, true);
        const result = job.status === 'completed' || job.status === 'failed' ? job : await api('GET', `ingestion/import-jobs/${job.id}`, undefined, true);
        if (result.status !== 'completed' || !result.versionId) throw new Error(`Import ${version.key} failed: ${JSON.stringify(result)}`);
        detail = await countryDetail(country.isoCode);
        constitution = detail?.constitutions.find((item) => item.slug === country.constitutionSlug);
        existing = constitution?.versions.find((item) => item.id === result.versionId);
      }
      if (!existing || !constitution) throw new Error(`Missing ${version.key} after import`);
      assertEqual(detail.name, payload.countryName, `${version.key} country name`);
      assertFields(constitution, { slug: payload.constitutionSlug, title: payload.constitutionTitle }, ['slug', 'title'], `${version.key} constitution`);
      assertFields(existing, payload, ['versionLabel', 'effectiveDate', 'languageCode', 'sourceUrl', 'gazetteReference'], `${version.key} version`);
      assertEqual(existing.predecessorVersionId ?? null, version.predecessor ? ids.versions[version.predecessor] : null, `${version.key} predecessor`);
      assertEqual(existing.hopKind, version.predecessor ? 'legal' : 'initial', `${version.key} hop kind`);
      const actualOutline = constitution.contentOutline.kinds.map((kind) => ({
        kindCode: kind.kindCode, displayLabel: kind.displayLabel, presentation: kind.presentation,
        showLabel: kind.showLabel, showTitle: kind.showTitle, showKind: kind.showKind,
      }));
      const expectedOutline = payload.outline.kinds.map((kind) => ({
        kindCode: kind.kindCode, displayLabel: kind.displayLabel, presentation: kind.presentation ?? 'section',
        showLabel: kind.showLabel ?? true, showTitle: kind.showTitle ?? false, showKind: kind.showKind ?? false,
      }));
      assertEqual(JSON.stringify(actualOutline), JSON.stringify(expectedOutline), `${version.key} outline`);
      ids.constitutions[country.isoCode] = constitution.id;
      ids.versions[version.key] = existing.id;
      await verifyArticles(existing.id, payload);
    }
  }
}

function amendmentPayload(record, ids) {
  return {
    title: record.title, comment: `Synthetic E2E history for ${record.title}.`,
    documents: [{ url: `https://example.org/atlas-e2e/${record.key}.pdf`, label: 'Synthetic source document' }],
    enactedOn: record.enactedOn, effectiveOn: record.effectiveOn,
    sourceVersionId: ids.versions[record.source], targetVersionId: ids.versions[record.target],
    changes: [{ articleNumber: record.articleNumber, changeType: 'changed', note: 'Synthetic legal revision.' }],
  };
}

async function ensureAmendments(ids) {
  for (const record of manifest.amendments) {
    const constitutionId = ids.constitutions[record.constitution];
    const path = `amendment/constitutions/${constitutionId}/amendments`;
    let list = await api('GET', `${path}?status=all`, undefined, true);
    let item = list.find((amendment) => amendment.title === record.title);
    if (!item && !verifyOnly) {
      const payload = amendmentPayload(record, ids);
      item = await api('POST', path, payload, true);
      if (record.key === 'xa-2022-law') item = await api('POST', `amendment/amendments/${item.id}/revisions`, payload, true);
      item = await api('POST', `amendment/amendments/${item.id}/publish`, undefined, true);
      list = await api('GET', `${path}?status=all`, undefined, true);
      item = list.find((amendment) => amendment.id === item.id);
    }
    if (!item) throw new Error(`Missing amendment ${record.key}`);
    const expected = amendmentPayload(record, ids);
    assertFields(item, { ...expected, status: 'published' },
      ['status', 'title', 'comment', 'enactedOn', 'effectiveOn', 'sourceVersionId', 'targetVersionId'], record.key);
    assertEqual(JSON.stringify(item.documents.map(({ url, label }) => ({ url, label }))), JSON.stringify(expected.documents), `${record.key} documents`);
    assertEqual(JSON.stringify(item.changes.map(({ articleNumber, changeType, note }) => ({ articleNumber, changeType, note }))),
      JSON.stringify(expected.changes), `${record.key} changes`);
    const revisions = await api('GET', `amendment/amendments/${item.id}/revisions`, undefined, true);
    assertEqual(revisions.length, record.key === 'xa-2022-law' ? 2 : 1, `${record.key} revision count`);
    for (const [index, revision] of revisions.entries()) {
      assertFields(revision, expected, ['title', 'comment', 'enactedOn', 'effectiveOn', 'sourceVersionId', 'targetVersionId'], `${record.key} revision ${index + 1}`);
      assertEqual(JSON.stringify(revision.documents.map(({ url, label }) => ({ url, label }))), JSON.stringify(expected.documents), `${record.key} revision ${index + 1} documents`);
      assertEqual(JSON.stringify(revision.changes.map(({ articleNumber, changeType, note }) => ({ articleNumber, changeType, note }))),
        JSON.stringify(expected.changes), `${record.key} revision ${index + 1} changes`);
    }
    ids.amendments[record.key] = item.id;
  }
}

async function verifyTotals(ids) {
  const countries = await api('GET', 'catalog/countries');
  assertEqual(manifest.countries.filter((expected) => countries.some((actual) => actual.isoCode === expected.isoCode)).length, manifest.expected.countries, 'fixture countries');
  assertEqual(Object.keys(ids.constitutions).length, manifest.expected.constitutions, 'fixture constitutions');
  assertEqual(Object.keys(ids.versions).length, manifest.expected.versions, 'fixture versions');
  assertEqual(Object.keys(ids.amendments).length, manifest.expected.amendments, 'fixture amendments');
  let articleCount = 0;
  for (const versionId of Object.values(ids.versions)) articleCount += (await api('GET', `content/versions/${versionId}/articles?limit=200`)).length;
  assertEqual(articleCount, manifest.expected.articles, 'fixture article snapshots');
  if (!verifyOnly) await api('POST', 'search/reindex', undefined, true);
  for (const country of manifest.countries) {
    const search = await api('GET', `search/search?q=dignity&country=${country.isoCode}&limit=50`);
    assertEqual(search.total, country.versions.length, `${country.isoCode} indexed dignity hits`);
    for (const version of country.versions) {
      const payload = fixture(version.file);
      const query = `search/search?q=dignity&country=${country.isoCode}&versionId=${ids.versions[version.key]}&effectiveDate=${payload.effectiveDate}&limit=50`;
      const filtered = await api('GET', query);
      assertEqual(filtered.total, 1, `${version.key} indexed version/date hit`);
      assertFields(filtered.hits[0], { versionId: ids.versions[version.key], countryCode: country.isoCode, effectiveDate: payload.effectiveDate },
        ['versionId', 'countryCode', 'effectiveDate'], `${version.key} search hit`);
    }
  }
}

await waitForStack();
await authenticate();
const ids = { constitutions: {}, versions: {}, amendments: {} };
await ensureVersions(ids);
await ensureAmendments(ids);
await verifyTotals(ids);
const resultPath = join(fixtureDir, '.runtime', 'prepopulate-ids.json');
mkdirSync(dirname(resultPath), { recursive: true });
writeFileSync(resultPath, `${JSON.stringify(ids, null, 2)}\n`);
console.log(`Prepopulation ${verifyOnly ? 'verified' : 'uploaded and verified'}: ${JSON.stringify(manifest.expected)}`);
