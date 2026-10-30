import assert from 'node:assert/strict';
import { namespace, stableId, irregularRoots, irregularOutline } from './definitions.mjs';
import { ensurePublished, payloadFor, readerPath } from './content.mjs';
import { documentFixture, attach } from './assets.mjs';
import { assertSubset, seedWorkflow } from './runtime.mjs';

export async function archiveScenario(ctx, scenario) {
  const jurisdictions = await ctx.api('GET', 'catalog/jurisdictions');
  let parent = jurisdictions.find(j => j.slug === `${namespace}-federation`);
  if (!parent && !ctx.verifyOnly) parent = await ctx.api('POST', 'catalog/jurisdictions', { slug: `${namespace}-federation`, name: 'Atlas Historical Federation', kind: 'historical_polity', historical: true }, true);
  assert(parent, 'Historical parent jurisdiction missing');
  const children = await ctx.api('GET', `catalog/jurisdictions?parentId=${parent.id}`);
  let region = children.find(j => j.slug === `${namespace}-region`);
  if (!region && !ctx.verifyOnly) region = await ctx.api('POST', 'catalog/jurisdictions', { slug: `${namespace}-region`, parentId: parent.id, name: 'Atlas Historical Region', kind: 'region', historical: true, existedFrom: '1800-01-01', existedUntil: '1900-12-31' }, true);
  assert(region, 'Historical region missing');
  assertSubset(region, { parentId: parent.id, historical: true, kind: 'region' }, 'Jurisdiction hierarchy');
  const roots = irregularRoots(scenario.key);
  const source = await ensurePublished(ctx, scenario.key, payloadFor(scenario, roots, { jurisdictionId: region.id, isoCode: '', countryName: '', languageCode: 'de', outline: irregularOutline,
    versionLabel: 'Nach 1849', effectiveDate: null, sourceEvidence: { dateWording: 'nach 1849', datePrecision: 'uncertain', coverage: 'Synthetic historical excerpt', attribution: 'Atlas synthetic archive' } }));
  const timeline = [ ['adopted', '1849-01-01', 'approximate'], ['commenced', '1850-01-01', 'exact'], ['suspended', '1860-01-01', 'exact'], ['restored', '1861-01-01', 'exact'], ['repealed', '1900-01-01', 'exact'] ];
  for (const [eventType, eventDate, dateCertainty] of timeline) {
    const events = await ctx.api('GET', `catalog/constitutions/${source.constitutionId}/lifecycle-events`);
    const expected = { eventType, eventDate, dateCertainty, note: 'Synthetic lifecycle event for manual exploration.' };
    const existing = events.find(e => e.eventType === eventType && e.eventDate === eventDate);
    if (existing) assertSubset(existing, expected, `Lifecycle ${eventType}`);
    else {
      assert(!ctx.verifyOnly, `Missing lifecycle ${eventType}`);
      await ctx.api('POST', `catalog/constitutions/${source.constitutionId}/lifecycle-events`, expected, ctx.publisherToken);
    }
  }
  const provisionPath = `catalog/constitutions/${source.constitutionId}/provision-events`;
  for (const [eventType, eventDate] of [['deferred', '1849-06-01'], ['commenced', '1851-01-01'], ['suspended', '1855-01-01'], ['restored', '1856-01-01']]) {
    const events = await ctx.api('GET', provisionPath);
    if (!events.some(e => e.eventType === eventType && e.eventDate === eventDate)) {
      assert(!ctx.verifyOnly, `Missing provision ${eventType}`);
      await ctx.api('POST', provisionPath, { eventType, eventDate, sourceVersionId: source.versionId, logicalUnitIds: [roots[1].logicalId], note: 'Synthetic provision lifecycle.' }, ctx.publisherToken);
    }
  }
  const legacyOrigin = new URL(ctx.baseUrl); legacyOrigin.hostname = 'legacy.localhost';
  const legacyUrl = new URL(`/${namespace}/regional.htm#note-a`, legacyOrigin).toString();
  const response = await ctx.raw('GET', `catalog/legacy-resolve?url=${encodeURIComponent(legacyUrl)}`, undefined, false);
  if (response.status === 404 && !ctx.verifyOnly) await ctx.api('POST', 'catalog/legacy-mappings', { sourceUrl: legacyUrl, kind: 'note', versionId: source.versionId, logicalId: stableId(`${scenario.key}:note`) }, true);
  else assert.equal(response.status, 200, 'Legacy mapping read');
  const resolved = await ctx.api('GET', `catalog/legacy-resolve?url=${encodeURIComponent(legacyUrl)}`, undefined, false);
  assert(resolved.targetUrl.includes(source.versionId) && resolved.targetUrl.includes('#fn-'), 'Exact historical note target');
  return { ...source, jurisdictionId: region.id, legacyUrl, legacyHref: resolved.targetUrl, href: readerPath(source), state: 'published' };
}
export async function contextScenario(ctx, scenario) {
  const source = await ensurePublished(ctx, scenario.key, payloadFor(scenario));
  const pdf = await documentFixture(ctx, 'source-pdf', 'pdf', source.constitutionId);
  const capture = await documentFixture(ctx, 'source-capture', 'html', source.constitutionId);
  const image = await documentFixture(ctx, 'context-picture', 'image');
  for (const [targetType, targetId] of [['constitution', source.constitutionId], ['country', (await ctx.api('GET', 'catalog/countries/XA')).id]]) {
    const path = `catalog/wiki/${targetType}/${targetId}`;
    const observe = () => ctx.api('GET', `${path}/draft`);
    const page = title => ({ summary: title, body: '# Fictional context\n\nThis context page is independent of the enacted wording.\n\nSynthetic material for testing.', sourceUrls: [`https://example.org/${namespace}/context`], images: [{ documentId: image.id, revision: image.pinnedRevision, alt: 'A blue and gold synthetic flag', caption: 'Synthetic context picture', credit: 'Constitution Atlas fixtures', rights: 'CC0', placement: 'after_body' }] });
    const steps = [() => ctx.api('PUT', `${path}/draft`, page('Published exploration context'), ctx.editorToken), async current => {
      await attach(ctx, `${targetType}_wiki`, targetId, image.id, image.pinnedRevisionId, current.id);
      await ctx.api('POST', `${path}/publish`, { revisionId: current.id }, ctx.publisherToken);
    }, current => ctx.api('PUT', `${path}/draft`, { ...page('Unpublished exploration context draft'), expectedRevisionId: current.id }, ctx.editorToken)];
    const result = await seedWorkflow({ key: `wiki:${targetType}:${targetId}`, observe, steps, journal: ctx.journal, verifyOnly: ctx.verifyOnly });
    const published = await ctx.api('GET', path, undefined, false);
    assert(published, `${targetType}: published context missing`);
    if (!result.preserved) { assert.equal(published.summary, 'Published exploration context'); assert.equal(result.value.summary, 'Unpublished exploration context draft'); assert.notEqual(result.value.id, published.id); }
  }
  return { ...source, documents: { pdf, capture, image }, href: `/editor/wiki/constitution/${source.constitutionId}?code=XA`, state: 'draft' };
}
export async function comparisonScenario(ctx, scenario, results) {
  const first = results['reader-lab']; const second = results['historical-region']; const capture = results['documents-context'].documents.capture;
  const definition = { attemptId: stableId(scenario.key), title: scenario.title, attribution: 'Atlas synthetic comparison source', sourceUrl: `https://example.org/${namespace}/comparison`,
    sourceDocumentId: capture.id, sourceDocumentRevision: capture.pinnedRevision,
    columns: [{ constitutionId: first.constitutionId, versionId: first.versionId, label: 'National instrument' }, { constitutionId: second.constitutionId, versionId: second.versionId, label: 'Historical regional instrument' }],
    topics: [{ title: 'Authored freedom provisions', passages: [{ column: 0, logicalId: first.snapshot.roots[1].logicalId }, { column: 1, logicalId: second.snapshot.roots[1].logicalId }] },
      { title: 'A source without a counterpart', passages: [{ column: 0, logicalId: first.snapshot.roots[0].logicalId }], missingColumns: [1] }] };
  const observe = async () => {
    const items = await ctx.api('GET', 'catalog/curated-comparisons');
    const item = items.find(c => c.title === scenario.title);
    return item ? ctx.api('GET', `catalog/curated-comparisons/${item.id}`) : null;
  };
  const steps = [() => ctx.api('POST', 'catalog/curated-comparisons', definition, true), current => ctx.api('POST', `catalog/curated-comparisons/${current.id}/review`, { reason: 'Checked synthetic authored correspondences and missing counterpart.' }, ctx.reviewerToken), current => ctx.api('POST', `catalog/curated-comparisons/${current.id}/publish`, {}, ctx.publisherToken)];
  const result = await seedWorkflow({ key: scenario.key, observe, steps, journal: ctx.journal, verifyOnly: ctx.verifyOnly });
  assert(result.value, 'Curated comparison missing');
  assertSubset(result.value.definition, definition, 'Exact comparison definition');
  if (!result.preserved) assert.equal(result.value.state, 'published');
  return { ...result, comparisonId: result.value.id, href: `/comparisons/${result.value.id}?topic=0&columns=0,1`, state: result.value.state };
}
