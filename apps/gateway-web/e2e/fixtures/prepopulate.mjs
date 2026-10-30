import { parseOptions } from './scenarios/definitions.mjs';
import { runScenarios } from './scenarios/index.mjs';
import { allPages } from './scenarios/runtime.mjs';
import { fixtureVersion, publishFixture } from './prepopulate-import.mjs';
import { authenticateFixtures, prepopulateTarget, requireCompletedFixtureSetup } from './prepopulate-access.mjs';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'generated');
const manifest = JSON.parse(readFileSync(join(fixtureDir, 'manifest.json'), 'utf8'));
const { verifyOnly, profile } = parseOptions(process.argv.slice(2));
const baseUrl = prepopulateTarget(process.env);
const endpoint = (path) => new URL(`/api/${path}`, baseUrl).toString();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let token;
let reviewerToken;
let publisherToken;
let editorToken;
let viewerToken;
const publicVersions = {};

async function raw(method, path, body, authenticated = method === 'GET' && Boolean(token), extraHeaders = {}) {
  if (verifyOnly && method !== 'GET' && !['identity/login', 'identity/login/mfa'].includes(path)) throw new Error(`Verify-only refused ${method} ${path}`);
  const form = body instanceof FormData;
  return fetch(endpoint(path), {
    method,
    headers: { ...extraHeaders, Accept: 'application/json', ...(body === undefined || form ? {} : { 'Content-Type': 'application/json' }), ...(authenticated ? { Authorization: `Bearer ${authenticated === true ? token : authenticated}` } : {}) },
    ...(body === undefined ? {} : { body: form ? body : JSON.stringify(body) }),
    signal: AbortSignal.timeout(60000),
  });
}
async function api(method, path, body, authenticated = method === 'GET' && Boolean(token), extraHeaders = {}) {
  const response = await raw(method, path, body, authenticated, extraHeaders);
  const text = await response.text();
  if (!response.ok) { const error = new Error(`${method} ${path}: HTTP ${response.status} ${text.slice(0, 1000)}`); error.status = response.status; throw error; }
  return text ? JSON.parse(text) : null;
}

async function authenticate() {
  ({ token, reviewerToken, publisherToken, editorToken, viewerToken } = await authenticateFixtures(api, process.env, profile !== 'compact'));
}

async function waitForStack() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try { await api('GET', 'identity/actuator/health'); return; } catch { await pause(2000); }
  }
  throw new Error('Identity API did not become ready');
}

async function countryDetail(iso) {
  const countries = await api('GET', 'catalog/countries');
  if (!countries.some((country) => country.isoCode === iso)) return null;
  return api('GET', `catalog/countries/${iso}`, undefined, token);
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
  const articles = await allPages(api, `content/versions/${versionId}/articles?includeBody=true`);
  if (payload.roots?.length) {
    assertEqual(articles.length, payload.roots.length, `${payload.isoCode}/${payload.versionLabel} root count`);
    payload.roots.forEach((root, index) => {
      assertFields(articles[index], { kind: root.kind, articleNumber: root.label ?? '', title: root.title ?? '' }, ['kind', 'articleNumber', 'title'], `root ${index + 1}`);
      assertEqual(articles[index].sortOrder, index + 1, `root ${index + 1} order`);
    });
    return;
  }
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
function comparableEntries(entries) {
  return (entries ?? []).map((entry) => entry.node ? { type: 'child', node: comparableRoot(entry.node) } : {
    type: 'text', logicalId: entry.logicalId, text: entry.text ?? (entry.table?.rows.map(row => row.cells.map(cell => cell.text).join(' ')).join('\n') ?? null), format: entry.format ?? "plain",
    table: entry.table ? { caption: entry.table.caption ?? null, rows: entry.table.rows.map(row => ({ logicalId: row.logicalId, cells: row.cells.map(cell => ({ logicalId: cell.logicalId, text: cell.text, header: cell.header ?? false, rowSpan: cell.rowSpan ?? 1, colSpan: cell.colSpan ?? 1, headers: cell.headers ?? [] })) })) } : null,
    footnoteLabel: entry.footnoteLabel ?? null,
    marks: entry.marks ?? [],
    references: (entry.references ?? []).map(ref => ({ logicalId: ref.logicalId, start: ref.start, end: ref.end, target: { type: ref.target.type, logicalId: ref.target.logicalId ?? null, url: ref.target.url ?? null, footnoteId: ref.target.footnoteId ?? null } })),
  });
}
function comparableRoot(node) {
  return { logicalId: node.logicalId, kind: node.kind, label: node.label ?? null, title: node.title ?? null, content: comparableEntries(node.content) };
}
async function verifyRoots(versionId, payload, sourceVersionId) {
  if (!payload.roots?.length) return;
  const snapshot = await api('GET', `content/versions/${versionId}/content`);
  assertEqual(JSON.stringify(snapshot.roots.map(comparableRoot)), JSON.stringify(payload.roots.map(comparableRoot)), `${payload.isoCode}/${payload.versionLabel} ordered roots`);
  const exported = await api('GET', `content/versions/${versionId}/export`);
  assertEqual(JSON.stringify(exported.roots.map(comparableRoot)), JSON.stringify(payload.roots.map(comparableRoot)), `${payload.isoCode}/${payload.versionLabel} export`);
  if (sourceVersionId) {
    const source = await api('GET', `content/versions/${sourceVersionId}/content`);
    function lineage(roots) {
      const result = [];
      function visit(node) {
        result.push([node.logicalId, node.predecessorRevisionId ?? null]);
        for (const entry of node.content ?? []) entry.node ? visit(entry.node) : result.push([entry.logicalId, entry.predecessorRevisionId ?? null]);
      }
      roots.forEach(visit);
      return result;
    }
    assertEqual(JSON.stringify(lineage(exported.roots)), JSON.stringify(lineage(linkPredecessors(payload.roots, source))), `${payload.isoCode}/${payload.versionLabel} predecessor lineage`);
  }
}
function linkPredecessors(roots, source) {
  const revisions = new Map();
  function collect(node) {
    revisions.set(node.logicalId, node.revisionId);
    for (const entry of node.content ?? []) {
      if (entry.node) collect(entry.node);
      else revisions.set(entry.logicalId, entry.revisionId);
    }
  }
  source.roots.forEach(collect);
  function link(node) {
    return { ...node, ...(revisions.has(node.logicalId) ? { predecessorRevisionId: revisions.get(node.logicalId) } : {}),
      content: node.content.map(entry => entry.node ? { ...entry, node: link(entry.node) } : {
        ...entry, ...(revisions.has(entry.logicalId) ? { predecessorRevisionId: revisions.get(entry.logicalId) } : {}),
      }) };
  }
  return roots.map(link);
}

async function ensureVersions(ids) {
  for (const country of manifest.countries) {
    for (const version of country.versions) {
      const payload = fixture(version.file);
      let detail = await countryDetail(country.isoCode);
      let constitution = detail?.constitutions.find((item) => item.slug === country.constitutionSlug);
      let existing = fixtureVersion(constitution?.versions, payload.versionLabel);
      if (!existing && !verifyOnly) {
        const pin = constitution ? await api('GET', `catalog/constitutions/${constitution.id}/settings`) : null;
        const source = version.predecessor && payload.roots?.length ? await api('GET', `content/versions/${ids.versions[version.predecessor]}/content`) : null;
        const request = { ...payload, ...(source ? { roots: linkPredecessors(payload.roots, source) } : {}), ...(pin ? { outline: undefined, constitutionId: constitution.id, settingsRevisionId: pin.id } : {}),
          ...(version.predecessor ? { predecessorVersionId: ids.versions[version.predecessor], hopKind: 'legal' } : {}) };
        const result = await publishFixture({ api, pause, reviewerToken, publisherToken }, version, payload, request, Boolean(pin));
        detail = await countryDetail(country.isoCode);
        constitution = detail?.constitutions.find((item) => item.slug === country.constitutionSlug);
        existing = fixtureVersion(constitution?.versions, payload.versionLabel);
        assertEqual(existing?.id, result.versionId, `${version.key} imported identity`);
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
        ...(payload.roots?.length ? { root: kind.root, allowedChildKinds: kind.allowedChildKinds } : {}),
      }));
      const expectedOutline = payload.outline.kinds.map((kind) => ({
        kindCode: kind.kindCode, displayLabel: kind.displayLabel, presentation: kind.presentation ?? 'section',
        showLabel: kind.showLabel ?? true, showTitle: kind.showTitle ?? false, showKind: kind.showKind ?? false,
        ...(payload.roots?.length ? { root: kind.root, allowedChildKinds: kind.allowedChildKinds } : {}),
      }));
      assertEqual(JSON.stringify(actualOutline), JSON.stringify(expectedOutline), `${version.key} outline`);
      ids.constitutions[country.isoCode] = constitution.id;
      ids.versions[version.key] = existing.id;
      publicVersions[version.key] = existing.currentVersionId ?? existing.id;
      await verifyArticles(existing.id, payload);
      await verifyRoots(existing.id, payload, version.predecessor ? ids.versions[version.predecessor] : null);
    }
  }
}

function amendmentPayload(record, ids) {
  return {
    title: record.title, comment: `Synthetic E2E history for ${record.title}.`,
    documents: [{ url: `https://example.org/atlas-e2e/${record.key}.pdf`, label: 'Synthetic source document' }],
    enactedOn: record.enactedOn, effectiveOn: record.effectiveOn,
    sourceVersionId: ids.versions[record.source], targetVersionId: ids.versions[record.target],
    changes: [{
      articleNumber: record.articleNumber, changeType: 'changed', note: 'Synthetic legal revision.',
      amendingLawTitle: record.title, amendingLawCitation: record.citation,
    }],
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
    }
    if (item?.status === 'draft' && !verifyOnly) {
      const revisions = await api('GET', `amendment/amendments/${item.id}/revisions`, undefined, true);
      if (record.key === 'xa-2022-law' && revisions.length === 1) {
        item = await api('POST', `amendment/amendments/${item.id}/revisions`, amendmentPayload(record, ids), true);
      }
      const review = await api('GET', `amendment/amendments/${item.id}/diff-review`, undefined, true);
      for (const candidate of review.candidates) {
        await api('POST', `amendment/amendments/${item.id}/diff-review/decisions`, {
          expectedRevisionId: review.revisionId,
          key: candidate.key,
          fingerprint: candidate.fingerprint,
          status: 'excluded_with_reason',
          exclusionReason: 'Synthetic history fixture; no exact change-row selection is stored.',
          reviewerAcknowledged: true,
        }, true);
      }
      item = await api('POST', `amendment/amendments/${item.id}/publish`, undefined, true);
      list = await api('GET', `${path}?status=all`, undefined, true);
      item = list.find((amendment) => amendment.id === item.id);
    }
    if (!item) throw new Error(`Missing amendment ${record.key}`);
    const expected = amendmentPayload(record, ids);
    assertFields(item, { ...expected, status: 'published' },
      ['status', 'title', 'comment', 'enactedOn', 'effectiveOn', 'sourceVersionId', 'targetVersionId'], record.key);
    assertEqual(JSON.stringify(item.documents.map(({ url, label }) => ({ url, label }))), JSON.stringify(expected.documents), `${record.key} documents`);
    assertEqual(JSON.stringify(item.changes.map(({ articleNumber, changeType, note, amendingLawTitle, amendingLawCitation }) =>
      ({ articleNumber, changeType, note, amendingLawTitle, amendingLawCitation }))),
      JSON.stringify(expected.changes), `${record.key} changes`);
    const revisions = await api('GET', `amendment/amendments/${item.id}/revisions`, undefined, true);
    assertEqual(revisions.length, record.key === 'xa-2022-law' ? 2 : 1, `${record.key} revision count`);
    for (const [index, revision] of revisions.entries()) {
      assertFields(revision, expected, ['title', 'comment', 'enactedOn', 'effectiveOn', 'sourceVersionId', 'targetVersionId'], `${record.key} revision ${index + 1}`);
      assertEqual(JSON.stringify(revision.documents.map(({ url, label }) => ({ url, label }))), JSON.stringify(expected.documents), `${record.key} revision ${index + 1} documents`);
      assertEqual(JSON.stringify(revision.changes.map(({ articleNumber, changeType, note, amendingLawTitle, amendingLawCitation }) =>
        ({ articleNumber, changeType, note, amendingLawTitle, amendingLawCitation }))),
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
  for (const versionId of Object.values(ids.versions)) articleCount += (await allPages(api, `content/versions/${versionId}/articles`)).length;
  assertEqual(articleCount, manifest.expected.articles, 'fixture article snapshots');
  if (!verifyOnly) await api('POST', 'search/reindex', undefined, true);
  for (const country of manifest.countries) {
    for (const version of country.versions) {
      const payload = fixture(version.file);
      const publicId = publicVersions[version.key];
      const corrected = publicId !== ids.versions[version.key];
      const query = `search/search?q=dignity&country=${country.isoCode}&versionId=${publicId}&effectiveDate=${payload.effectiveDate}&limit=50`;
      const filtered = await api('GET', query);
      if (corrected) {
        if (filtered.total < 1) throw new Error(`${version.key}: current editorial snapshot is not indexed`);
      } else assertEqual(filtered.total, 1, `${version.key} indexed version/date hit`);
      assertFields(filtered.hits[0], { versionId: publicId, countryCode: country.isoCode, effectiveDate: payload.effectiveDate },
        ['versionId', 'countryCode', 'effectiveDate'], `${version.key} search hit`);
    }
  }
  for (const [key, term] of [['xc-2020', 'Annual'], ['xc-2024', 'Biennial'], ['xc-2024', 'revised source note']]) {
    if (publicVersions[key] !== ids.versions[key]) continue; // The original snapshot is verified above; search serves its editorial tip.
    const result = await api('GET', `search/search?q=${encodeURIComponent(term)}&country=XC&versionId=${ids.versions[key]}&limit=50`);
    assertEqual(result.total, 1, `${key} indexed rich content '${term}'`);
  }
}

await waitForStack();
await requireCompletedFixtureSetup(api);
await authenticate();
const ids = { constitutions: {}, versions: {}, amendments: {} };
await ensureVersions(ids);
await ensureAmendments(ids);
await verifyTotals(ids);
await runScenarios({ api, raw, pause, token, editorToken, viewerToken, reviewerToken, publisherToken, verifyOnly, profile, baseUrl, ids, runtimeDir: join(fixtureDir, '.runtime'), refreshTokens: async () => { await authenticate(); return { token, editorToken, viewerToken, reviewerToken, publisherToken }; } });
const resultPath = join(fixtureDir, '.runtime', 'prepopulate-ids.json');
mkdirSync(dirname(resultPath), { recursive: true });
writeFileSync(resultPath, `${JSON.stringify(ids, null, 2)}\n`);
console.log(`Prepopulation ${profile} baseline ${verifyOnly ? 'verified' : 'uploaded and verified'}: ${JSON.stringify(manifest.expected)}`);
