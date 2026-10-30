import assert from 'node:assert/strict';
import { publishFixture, fixtureVersion } from '../prepopulate-import.mjs';
import { comparableRoots, linkRoots, allPages, assertSubset } from './runtime.mjs';
import { namespace, simpleOutline, rootsFor } from './definitions.mjs';

export function payloadFor(scenario, roots = rootsFor(scenario.key), overrides = {}) {
  return { isoCode: 'XA', countryName: 'Atlas Testland', constitutionSlug: `${namespace}-${scenario.key}`, constitutionTitle: scenario.title,
    versionLabel: 'Original', effectiveDate: '2000-01-01', languageCode: 'en', sourceUrl: `https://example.org/${namespace}/${scenario.key}`,
    sourceEvidence: { description: `Synthetic source for ${scenario.title}.`, dateWording: '1 January 2000', datePrecision: 'day', attribution: 'Constitution Atlas fixture generator' },
    outline: simpleOutline, roots, ...overrides };
}
export async function findConstitution(ctx, payload) {
  const detail = payload.jurisdictionId
    ? await ctx.api('GET', `catalog/jurisdictions/${payload.jurisdictionId}`)
    : await ctx.api('GET', `catalog/countries/${payload.isoCode}`);
  return detail.constitutions.find(c => c.slug === payload.constitutionSlug);
}
export async function ensurePublished(ctx, key, payload, predecessor, hopKind = 'legal') {
  let constitution = await findConstitution(ctx, payload);
  let existing = fixtureVersion(constitution?.versions, payload.versionLabel);
  if (!existing && !ctx.verifyOnly) {
    const pin = constitution ? await ctx.api('GET', `catalog/constitutions/${constitution.id}/settings`) : null;
    const source = predecessor ? await ctx.api('GET', `content/versions/${predecessor}/content`) : null;
    const request = { ...payload, ...(source ? { roots: linkRoots(payload.roots, source), predecessorVersionId: predecessor, hopKind } : {}),
      ...(pin ? { outline: undefined, constitutionId: constitution.id, settingsRevisionId: pin.id } : {}) };
    await publishFixture(ctx, { key: `${namespace}-${key}` }, payload, request, Boolean(pin));
    constitution = await findConstitution(ctx, payload);
    existing = fixtureVersion(constitution?.versions, payload.versionLabel);
  }
  assert(existing, `${key}: published snapshot missing`);
  const version = await ctx.api('GET', `catalog/versions/${existing.id}`, undefined, false);
  assertSubset(version, { versionLabel: payload.versionLabel, effectiveDate: payload.effectiveDate ?? null, languageCode: payload.languageCode,
    predecessorVersionId: predecessor ?? null, hopKind: predecessor ? hopKind : 'initial' }, `${key} version`);
  const snapshot = await ctx.api('GET', `content/versions/${existing.id}/content`, undefined, false);
  assert.deepEqual(comparableRoots(snapshot.roots), comparableRoots(payload.roots), `${key}: exact published ordered content`);
  const exported = await ctx.api('GET', `content/versions/${existing.id}/export`, undefined, false);
  assert.deepEqual(comparableRoots(exported.roots), comparableRoots(payload.roots), `${key}: export fidelity`);
  const articles = await allPages(ctx.api, `content/versions/${existing.id}/articles?includeBody=true`, false);
  assert.equal(articles.length, payload.roots.length, `${key}: all top-level units across pages`);
  const settings = await ctx.api('GET', `catalog/versions/${existing.id}/settings`);
  assert.equal(settings.id, exported.settingsRevisionId, `${key}: pinned structural settings`);
  if (predecessor) {
    const source = await ctx.api('GET', `content/versions/${predecessor}/content`);
    const expected = linkRoots(payload.roots, source);
    const lineage = nodes => nodes.flatMap(node => [[node.logicalId, node.predecessorRevisionId ?? null], ...node.content.flatMap(entry => entry.node ? lineage([entry.node]) : [[entry.logicalId, entry.predecessorRevisionId ?? null]])]);
    assert.deepEqual(lineage(exported.roots), lineage(expected), `${key}: revision lineage`);
  }
  return { constitutionId: constitution.id, versionId: existing.id, snapshot, payload, version };
}
export async function findImport(ctx, payload) {
  const jobs = await allPages(ctx.api, 'ingestion/import-jobs');
  const archived = await allPages(ctx.api, 'ingestion/import-jobs?archived=true');
  for (const job of [...jobs, ...archived]) {
    if (job.constitutionTitle !== payload.constitutionTitle || job.versionLabel !== payload.versionLabel) continue;
    const staged = await ctx.api('GET', `ingestion/import-jobs/${job.id}/payload`);
    if (staged.sourceUrl === payload.sourceUrl && staged.constitutionSlug === payload.constitutionSlug) return job;
  }
  return null;
}
export function readerPath(record) {
  return record.payload.jurisdictionId ? `/jurisdictions/${record.payload.jurisdictionId}/versions/${record.versionId}` : `/countries/${record.payload.isoCode}/versions/${record.versionId}`;
}
