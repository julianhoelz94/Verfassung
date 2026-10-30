import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { selectedScenarios, irregularRoots, irregularOutline, rootsFor } from './definitions.mjs';
import { payloadFor, ensurePublished, readerPath } from './content.mjs';
import { editorial, importWorkflow, setupWorkflow, historyScenario } from './workflows.mjs';
import { archiveScenario, contextScenario, comparisonScenario } from './catalog.mjs';
import { structuredScenario } from './structured.mjs';
import { amendmentScenario } from './amendments.mjs';
import { journalAt } from './runtime.mjs';

async function searchScenario(ctx, scenario) {
  const count = scenario.kind === 'scale' ? 225 : 30;
  const source = await ensurePublished(ctx, `${scenario.key}-en`, payloadFor(scenario, rootsFor(scenario.key, count)));
  const german = await ensurePublished(ctx, `${scenario.key}-de`, { ...source.payload, roots: rootsFor(scenario.key, count, 'de'), versionLabel: 'Deutsche Fassung', languageCode: 'de', effectiveDate: '2001-01-01' }, source.versionId);
  return { ...source, germanVersionId: german.versionId, expectedHits: count, href: `/search?q=Explorationneedle&versionId=${source.versionId}`, state: 'published' };
}
export async function runScenarios(ctx) {
  const started = performance.now();
  const actor = await ctx.api('GET', 'identity/me');
  ctx.journal = journalAt(ctx.runtimeDir, `${ctx.baseUrl.origin}|${actor.id}`);
  const results = {};
  let authenticatedAt = Date.now();
  for (const scenario of selectedScenarios(ctx.profile)) {
    if (ctx.refreshTokens && Date.now() - authenticatedAt > 120000) { Object.assign(ctx, await ctx.refreshTokens()); authenticatedAt = Date.now(); }
    console.log(`Scenario ${scenario.key}: ${ctx.verifyOnly ? 'verify' : 'ensure'}`);
    for (const dependency of scenario.dependencies) assert(results[dependency], `${scenario.key}: missing dependency ${dependency}`);
    let result;
    switch (scenario.kind) {
      case 'content': {
        const source = await ensurePublished(ctx, `${scenario.key}-original`, payloadFor(scenario, irregularRoots(scenario.key), { outline: irregularOutline }));
        const next = await ensurePublished(ctx, `${scenario.key}-revised`, { ...source.payload, versionLabel: 'Revised', effectiveDate: '2004-01-01', roots: irregularRoots(scenario.key, true) }, source.versionId);
        result = { ...source, revisedVersionId: next.versionId, href: readerPath(source), state: 'published' }; break;
      }
      case 'structured': result = await structuredScenario(ctx, scenario); break;
      case 'history': result = await historyScenario(ctx, scenario); break;
      case 'editor': case 'source': {
        const source = await ensurePublished(ctx, scenario.key, payloadFor(scenario));
        result = { ...source, ...await editorial(ctx, scenario, source, scenario.kind === 'source' ? 'returned' : scenario.intendedState, scenario.kind === 'source') }; break;
      }
      case 'import': result = await importWorkflow(ctx, scenario, scenario.intendedState); break;
      case 'setup': result = await setupWorkflow(ctx, scenario); break;
      case 'amendment': result = await amendmentScenario(ctx, scenario); break;
      case 'context': result = await contextScenario(ctx, scenario); break;
      case 'archive': result = await archiveScenario(ctx, scenario); break;
      case 'comparison': result = await comparisonScenario(ctx, scenario, results); break;
      case 'search': case 'scale': result = await searchScenario(ctx, scenario); break;
      default: throw new Error(`Unsupported scenario kind ${scenario.kind}`);
    }
    results[scenario.key] = result;
    console.log(`Scenario ${scenario.key}: ${result.state}${result.preserved ? ' (manual progress preserved)' : ''}`);
  }
  const reviewSession = results['editor-review'];
  if (reviewSession) {
    const forbidden = await ctx.raw('GET', `editor/edit-sessions/${reviewSession.sessionId}`, undefined, ctx.viewerToken);
    assert.equal(forbidden.status, 403, 'Viewer cannot inspect editorial work');
    if (!ctx.verifyOnly) {
      const reviewerWrite = await ctx.raw('POST', 'editor/edit-sessions', { versionId: results['reader-lab'].versionId }, ctx.reviewerToken);
      assert.equal(reviewerWrite.status, 403, 'Reviewer-only account cannot create an editing session');
    }
  }
  // One explicit rebuild for the whole upload. Verify-only never reindexes.
  if (!ctx.verifyOnly && Object.keys(results).length) await ctx.api('POST', 'search/reindex', undefined, true);
  for (const scenario of selectedScenarios(ctx.profile).filter(s => ['search', 'scale'].includes(s.kind))) {
    const record = results[scenario.key];
    const hits = [];
    for (let offset = 0; offset < record.expectedHits; offset += 10) {
      const page = await ctx.api('GET', `search/search?q=Explorationneedle&versionId=${record.versionId}&limit=10&offset=${offset}`, undefined, false);
      assert.equal(page.total, record.expectedHits, `${scenario.key}: indexed count`);
      assert(page.hits.length, `${scenario.key}: missing result page`);
      hits.push(...page.hits);
    }
    assert.equal(hits.length, record.expectedHits, `${scenario.key}: paginated hit count`);
    assert(hits.every(hit => hit.versionId === record.versionId), 'Search retains exact version');
    const german = await ctx.api('GET', `search/search?q=Freiheit&versionId=${record.germanVersionId}&limit=10`, undefined, false);
    assert.equal(german.total, record.expectedHits, `${scenario.key}: German indexed text`);
  }
  ctx.ids.scenarios = {};
  const guide = [`# Fixture scenarios (${ctx.profile})`, '', 'Synthetic material. Workflow examples can be changed manually; reruns preserve that progress.', '', `Origin: ${ctx.baseUrl.origin}`, '', '| Scenario | Sign in as | Open here | Try this | Expected result | Current state |', '| --- | --- | --- | --- | --- | --- |'];
  for (const scenario of selectedScenarios(ctx.profile)) {
    const result = results[scenario.key];
    const refs = {};
    for (const field of ['href', 'state', 'constitutionId', 'versionId', 'revisedVersionId', 'germanVersionId', 'sessionId', 'jobId', 'proposalId', 'jurisdictionId', 'amendmentId', 'comparisonId', 'legacyHref', 'legacyUrl', 'originals']) if (result[field] !== undefined) refs[field] = result[field];
    if (result.documents) refs.documents = Object.fromEntries(Object.entries(result.documents).map(([key, doc]) => [key, { id: doc.id, revision: doc.pinnedRevision, href: doc.href }]));
    ctx.ids.scenarios[scenario.key] = refs;
    guide.push(`| ${scenario.title} | ${scenario.role} | [${scenario.key}](${new URL(result.href, ctx.baseUrl)}) | ${scenario.action} | ${scenario.expected} | ${result.state}${result.preserved ? ' (preserved)' : ''} |`);
  }
  guide.push('', 'The editor account is selected by PREPOPULATE_EDITOR_* or the local/CI editor seed. That seed may hold several roles; provide an editor-only account to practice strict role separation. Credentials remain outside generated fixtures.', '', 'Runtime IDs and the target-scoped seed journal are in this ignored directory. Retain the journal for pending structure proposals; their API has no listing endpoint.');
  writeFileSync(join(ctx.runtimeDir, 'scenario-guide.md'), `${guide.join('\n')}\n`);
  writeFileSync(join(ctx.runtimeDir, 'scenario-index.json'), `${JSON.stringify({ profile: ctx.profile, origin: ctx.baseUrl.origin, scenarios: ctx.ids.scenarios }, null, 2)}\n`);
  console.log(`Verified ${Object.keys(results).length} exploration scenarios in ${((performance.now() - started) / 1000).toFixed(1)}s. Guide: ${join(ctx.runtimeDir, 'scenario-guide.md')}`);
}
