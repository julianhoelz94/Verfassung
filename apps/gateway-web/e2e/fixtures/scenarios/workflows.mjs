import assert from 'node:assert/strict';
import { allPages, seedWorkflow, assertSubset, comparableRoots } from './runtime.mjs';
import { payloadFor, ensurePublished, findImport } from './content.mjs';
import { namespace, rootsFor } from './definitions.mjs';

export async function editorial(ctx, scenario, source, state, sourceOnly = false) {
  const observe = async () => {
    const rows = [...await allPages(ctx.api, `editor/edit-sessions?versionId=${source.versionId}`), ...await allPages(ctx.api, `editor/edit-sessions?versionId=${source.versionId}&archived=true`)];
    assert(rows.length <= 1, `${scenario.key}: multiple sessions need manual inspection`);
    return rows[0] ? ctx.api('GET', `editor/edit-sessions/${rows[0].id}`) : null;
  };
  const sessionPath = current => `editor/edit-sessions/${current.session.id}`;
  const changedBody = `Saved draft for ${scenario.key}. This unpublished exploration text is private.`;
  const steps = [async () => ctx.api('POST', 'editor/edit-sessions', { versionId: source.versionId, hopKind: 'editorial_correction' }, ctx.editorToken), async current => {
    const path = sessionPath(current);
    if (sourceOnly) await ctx.api('POST', `${path}/source-evidence`, { expectedRevision: 0, evidence: { description: `Revised source description for ${scenario.key}.` }, reason: `Fixture source correction: ${scenario.key}` }, ctx.editorToken);
    else {
      const articles = await allPages(ctx.api, `content/versions/${source.versionId}/articles?includeBody=true`);
      await ctx.api('POST', `${path}/saves`, { articleId: articles[0].id, title: articles[0].title, body: changedBody }, ctx.editorToken);
      await ctx.api('POST', `${path}/publish-details`, { comment: `Fixture text correction: ${scenario.key}` }, ctx.editorToken);
    }
  }];
  if (state !== 'draft') steps.push(async current => ctx.api('POST', `${sessionPath(current)}/review`, sourceOnly ? { sourceEvidenceRevision: 1 } : {}, ctx.editorToken));
  if (state === 'returned') steps.push(async current => ctx.api('POST', `${sessionPath(current)}/source-evidence/changes-requested`, { expectedRevision: 1, reason: 'Please identify the synthetic archive operator before resubmitting.' }, ctx.reviewerToken));
  else if (['approved', 'published', 'archived'].includes(state)) {
    steps.push(async current => ctx.api('POST', `${sessionPath(current)}/approval`, sourceOnly ? { sourceEvidenceRevision: 1 } : {}, ctx.reviewerToken));
    if (state !== 'approved') steps.push(async current => {
      await ctx.api('POST', `${sessionPath(current)}/publish`, { hopKind: 'editorial_correction', ...(sourceOnly ? { sourceEvidenceRevision: 1 } : {}) }, ctx.publisherToken);
      for (let attempt = 0; attempt < 90; attempt++) {
        const published = await ctx.api('GET', sessionPath(current));
        if (published.session.status === 'published') return;
        await ctx.pause(1000);
      }
      throw new Error(`${scenario.key}: publication is still reconciling; no duplicate publication was submitted`);
    });
    if (state === 'archived') steps.push(async current => ctx.api('POST', `${sessionPath(current)}/archive`, { archived: true }, ctx.editorToken));
  }
  const result = await seedWorkflow({ key: scenario.key, observe, steps, journal: ctx.journal, verifyOnly: ctx.verifyOnly });
  const value = result.value;
  assert(value, `${scenario.key}: session missing`);
  assert.equal(value.session.versionId, source.versionId, `${scenario.key}: source pin`);
  if (!result.preserved) {
    const statuses = { draft: 'open', review: 'reviewing', approved: 'approved', published: 'published', archived: 'published', returned: 'open' };
    assert.equal(value.session.status, statuses[state], `${scenario.key}: initial workflow state`);
    if (sourceOnly) assert.equal(value.sourceEvidenceRevisions[0].evidence.description, `Revised source description for ${scenario.key}.`);
    else assert.equal(value.drafts[0].body, changedBody, `${scenario.key}: saved draft`);
  }
  const unchanged = await ctx.api('GET', `content/versions/${source.versionId}/content`, undefined, false);
  assert.deepEqual(unchanged, source.snapshot, `${scenario.key}: immutable source`);
  if (value.newVersionId && !result.preserved) {
    const next = await ctx.api('GET', `catalog/versions/${value.newVersionId}`, undefined, false);
    assert.equal(next.legalVersionId, source.version.legalVersionId ?? source.versionId, `${scenario.key}: correction legal identity`);
    if (sourceOnly) {
      const content = await ctx.api('GET', `content/versions/${value.newVersionId}/content`, undefined, false);
      assert.deepEqual(content.roots.map(r => r.revisionId), source.snapshot.roots.map(r => r.revisionId), 'Source-only correction reuses text revisions');
    }
  }
  return { ...result, sessionId: value.session.id, versionId: value.newVersionId ?? source.versionId, href: `/editor?sessionId=${value.session.id}`, state: value.session.status };
}
export async function importWorkflow(ctx, scenario, state) {
  const payload = payloadFor(scenario);
  const observe = () => findImport(ctx, payload);
  const steps = [async () => ctx.api('POST', 'ingestion/import-jobs', payload, ctx.editorToken, { 'Idempotency-Key': `${namespace}-${scenario.key}` })];
  if (state !== 'outline') steps.push(async job => {
    await ctx.api('POST', `ingestion/import-jobs/${job.id}/confirm-outline`, {}, ctx.editorToken);
    await ctx.api('POST', `ingestion/import-jobs/${job.id}/prepare`, {}, ctx.editorToken);
  });
  if (state === 'approved' || state === 'rejected') steps.push(job => ctx.api('POST', `ingestion/import-jobs/${job.id}/${state === 'approved' ? 'approve' : 'reject'}`, { reason: state === 'approved' ? 'Synthetic source and exact prepared sample reviewed.' : 'Synthetic rejection for practicing the import review workflow.' }, ctx.reviewerToken));
  const result = await seedWorkflow({ key: scenario.key, observe, steps, journal: ctx.journal, verifyOnly: ctx.verifyOnly });
  const job = result.value;
  assert(job, `${scenario.key}: import missing`);
  const staged = await ctx.api('GET', `ingestion/import-jobs/${job.id}/payload`);
  if (!result.preserved) {
    assertSubset(staged, payload, `${scenario.key}: exact submitted payload`);
    assert.equal(job.status, ['outline', 'review'].includes(state) ? 'pending_review' : state);
    assert.equal(Boolean(job.versionId), state !== 'outline', `${scenario.key}: prepared state`);
  }
  if (job.versionId && job.status !== 'completed') {
    const response = await ctx.raw('GET', `content/versions/${job.versionId}/content`, undefined, false);
    assert.equal(response.status, 404, `${scenario.key}: private draft read`);
    const search = await ctx.api('GET', `search/search?q=Explorationneedle&versionId=${job.versionId}`, undefined, false);
    assert.equal(search.total, 0, `${scenario.key}: unpublished search exclusion`);
  }
  return { ...result, jobId: job.id, versionId: job.versionId, href: `/admin/import/${job.id}`, state: job.status };
}
export async function setupWorkflow(ctx, scenario) {
  const known = ctx.journal.data.scenarios[scenario.key];
  const observe = () => known?.proposalId ? ctx.api('GET', `ingestion/import-setup-proposals/${known.proposalId}`) : Promise.resolve(null);
  // The setup API has no list/idempotency endpoint. Keep the returned proposal ID
  // in the origin/deployment-scoped runtime journal, outside Playwright output.
  if (!known && ctx.verifyOnly) throw new Error(`${scenario.key}: retain the runtime journal to verify the pending setup proposal`);
  if (!known) {
    const payload = payloadFor(scenario);
    const { versionLabel, effectiveDate, roots, sourceEvidence, ...base } = payload;
    const proposal = await ctx.api('POST', 'ingestion/import-setup-proposals', { ...base, sampleRoots: roots }, ctx.editorToken);
    ctx.journal.data.scenarios[scenario.key] = { proposalId: proposal.id, complete: true };
    ctx.journal.save();
  }
  const proposalId = ctx.journal.data.scenarios[scenario.key].proposalId;
  const value = await ctx.api('GET', `ingestion/import-setup-proposals/${proposalId}`);
  assert.equal(value.payload.constitutionSlug, `${namespace}-${scenario.key}`);
  return { value, proposalId, href: `/admin/import/setup/${proposalId}`, state: value.status, preserved: value.status !== 'pending_confirmation' };
}
export async function historyScenario(ctx, scenario) {
  const base = await ensurePublished(ctx, `${scenario.key}-original`, payloadFor(scenario));
  const first = await editorial(ctx, { ...scenario, key: `${scenario.key}-correction-1` }, base, 'published');
  const firstVersion = await ctx.api('GET', `catalog/versions/${first.versionId}`);
  const firstSnapshot = await ctx.api('GET', `content/versions/${first.versionId}/content`);
  const second = await editorial(ctx, { ...scenario, key: `${scenario.key}-correction-2` }, { ...base, versionId: first.versionId, version: firstVersion, snapshot: firstSnapshot }, 'published', true);
  const successorRoots = rootsFor(scenario.key);
  successorRoots[0].content[0].text = 'The next legal version extends civic freedom.';
  const successor = await ensurePublished(ctx, `${scenario.key}-legal`, { ...base.payload, roots: successorRoots, versionLabel: 'Legal successor', effectiveDate: '2005-01-01' }, second.versionId);
  assert.equal(successor.version.legalVersionId ?? successor.versionId, successor.versionId);
  return { ...successor, originals: [base.versionId, first.versionId, second.versionId], href: `/countries/XA/versions/${base.versionId}`, state: 'published' };
}
