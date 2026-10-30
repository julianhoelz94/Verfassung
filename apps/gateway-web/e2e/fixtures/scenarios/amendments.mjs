import assert from 'node:assert/strict';
import { ensurePublished, payloadFor } from './content.mjs';
import { rootsFor } from './definitions.mjs';
import { seedWorkflow } from './runtime.mjs';
import { editorial } from './workflows.mjs';

export async function amendmentScenario(ctx, scenario) {
  const roots = rootsFor(scenario.key, 4);
  const source = await ensurePublished(ctx, `${scenario.key}-source`, payloadFor(scenario, roots));
  const revised = structuredClone(roots);
  revised[0].content[0].text = 'The amended wording protects additional civic freedoms.';
  revised.splice(1, 1);
  revised.reverse();
  revised.push(rootsFor(`${scenario.key}-addition`, 1)[0]);
  revised.at(-1).label = '5';
  const target = await ensurePublished(ctx, `${scenario.key}-target`, { ...source.payload, roots: revised, versionLabel: 'Amended', effectiveDate: '2002-01-01' }, source.versionId);
  const observe = async () => {
    const list = await ctx.api('GET', `amendment/constitutions/${source.constitutionId}/amendments?status=all`);
    const existing = list.find(item => item.title === scenario.title);
    return existing ? ctx.api('GET', `amendment/amendments/${existing.id}`) : null;
  };
  const body = async () => {
    const suggestions = await ctx.api('POST', 'amendment/amendments/suggest', { sourceVersionId: source.versionId, targetVersionId: target.versionId }, ctx.editorToken);
    return { title: scenario.title, comment: 'Synthetic legal instrument; check each exact affected provision.', enactedOn: '2001-12-01', effectiveOn: '2002-01-01', sourceVersionId: source.versionId, targetVersionId: target.versionId,
      changes: suggestions.changes.map(change => ({ articleNumber: change.articleNumber, changeType: change.changeType, note: change.note, articleId: change.articleId, nodeId: change.nodeId, beforeRef: change.beforeRef, afterRef: change.afterRef, amendingLawTitle: scenario.title, amendingLawCitation: 'Synthetic Gazette 2001 No. 7' })) };
  };
  const steps = [async () => ctx.api('POST', `amendment/constitutions/${source.constitutionId}/amendments`, await body(), ctx.editorToken), async current => ctx.api('POST', `amendment/amendments/${current.id}/revisions`, { ...await body(), comment: 'Revised synthetic instrument description. Exact source and target pins are retained.' }, ctx.editorToken), async current => {
    const review = await ctx.api('GET', `amendment/amendments/${current.id}/diff-review`);
    const candidates = scenario.intendedState === 'review' ? review.candidates.slice(0, 1) : review.candidates;
    for (const candidate of candidates) {
      const ids = new Set([...candidate.beforeRefs, ...candidate.afterRefs].map(ref => ref.logicalId));
      const linked = current.changes.filter(change => [change.beforeRef?.logicalId, change.afterRef?.logicalId].some(id => ids.has(id))).map(change => change.id);
      await ctx.api('POST', `amendment/amendments/${current.id}/diff-review/decisions`, { expectedRevisionId: review.revisionId, key: candidate.key, fingerprint: candidate.fingerprint,
        status: linked.length ? 'linked' : 'excluded_with_reason', linkedChangeIds: linked,
        ...(linked.length ? {} : { exclusionReason: 'Container revision bookkeeping; the exact affected child provisions are linked separately.' }), reviewerAcknowledged: true }, ctx.reviewerToken);
    }
  }];
  if (scenario.intendedState !== 'review') steps.push(current => ctx.api('POST', `amendment/amendments/${current.id}/publish`, {}, ctx.publisherToken));
  if (scenario.intendedState === 'withdrawn') steps.push(current => ctx.api('POST', `amendment/amendments/${current.id}/withdraw`, {}, ctx.publisherToken));
  if (scenario.intendedState === 'stale') steps.push(async () => {
    await editorial(ctx, { ...scenario, key: `${scenario.key}-correction` }, source, 'published');
    await ctx.api('POST', `amendment/constitutions/${source.constitutionId}/amendments/refresh-review-status`, {}, ctx.publisherToken);
  });
  const result = await seedWorkflow({ key: scenario.key, observe, steps, journal: ctx.journal, verifyOnly: ctx.verifyOnly });
  const value = result.value; assert(value, `${scenario.key}: missing legal record`);
  assert.equal(value.sourceVersionId, source.versionId);
  assert.equal(value.targetVersionId, target.versionId);
  const revisions = await ctx.api('GET', `amendment/amendments/${value.id}/revisions`);
  if (!result.preserved) { assert.equal(revisions.length, 2); assert.equal(value.status, scenario.intendedState === 'review' ? 'draft' : scenario.intendedState === 'withdrawn' ? 'withdrawn' : 'published'); }
  if (scenario.intendedState === 'stale' && !result.preserved) assert.equal(value.reviewStatus, 'needs_review', `${scenario.key}: stale evidence`);
  return { ...result, constitutionId: source.constitutionId, versionId: target.versionId, amendmentId: value.id, href: `/editor/amendments/${value.id}`, state: value.status };
}
