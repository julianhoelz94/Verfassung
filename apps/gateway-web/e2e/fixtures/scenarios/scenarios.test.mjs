import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scenarios, selectedScenarios, parseOptions, irregularRoots, irregularOutline } from './definitions.mjs';
import { seedWorkflow, journalAt, allPages, comparableRoots } from './runtime.mjs';
import { prepareScenarioJournal } from './index.mjs';
import { setupWorkflow } from './workflows.mjs';

// Contracts: ADR 0002/0005, the fixture plan, and the rich-content import rules.
test('profiles retain baseline mode, include their dependencies and reject mistyped flags', () => {
  assert.equal(selectedScenarios('compact').length, 0);
  assert(selectedScenarios('extended').some(s => s.kind === 'archive'));
  assert(!selectedScenarios('extended').some(s => s.kind === 'scale'));
  assert(selectedScenarios('scale').some(s => s.kind === 'scale'));
  const seen = new Set();
  for (const scenario of scenarios) { assert(!seen.has(scenario.key)); scenario.dependencies.forEach(key => assert(seen.has(key))); seen.add(scenario.key); }
  assert.deepEqual(parseOptions(['--profile', 'scale', '--verify-only'], {}), { profile: 'scale', verifyOnly: true });
  assert.equal(parseOptions([], { PREPOPULATE_DEPLOYMENT_ENVIRONMENT: 'test' }).profile, 'compact');
  assert.equal(parseOptions([], {}).profile, 'extended');
  assert.throws(() => parseOptions(['--profle', 'scale'], {}), /Unknown/);
  assert.throws(() => parseOptions(['--profile=typo'], {}), /Unknown fixture profile/);
});
test('non-standard layouts contain mixed roots, skipped levels, interleaved text and unchanged literal labels', () => {
  const roots = irregularRoots('contract');
  assert.deepEqual(roots.map(n => n.kind), ['preamble', 'article', 'article', 'appendix']);
  assert.equal(roots[0].label, null); assert.equal(roots[0].title, null);
  assert.equal(roots[1].label, 'Art. I a'); assert.equal(roots[1].title, null);
  assert.equal(roots[2].label, null);
  const content = roots[1].content;
  assert(content.some(entry => entry.node?.kind === 'paragraph'));
  assert(content.some(entry => entry.node?.kind === 'sentence'));
  assert(content.some((entry, i) => !entry.node && content[i - 1]?.node && content[i + 1]?.node));
  const paragraph = content.find(entry => entry.node?.kind === 'paragraph').node;
  assert.deepEqual(paragraph.content.map(entry => entry.type), ['text', 'child', 'text']);
  const note = roots.at(-1).content.at(-1);
  assert.equal(note.format, 'footnote'); assert.equal(note.footnoteLabel, '[a]');
  assert.equal(note.annotation.kind, 'editorial');
  const table = roots.at(-1).content.find(entry => entry.format === 'table').table;
  assert.equal(table.rows[1].cells[0].rowSpan, 2);
  assert.equal(table.rows[2].cells.length, 1);
  assert.equal(table.rows.at(-1).cells[0].colSpan, 2);
  const explicit = roots[1].content.find(entry => entry.text === 'See Schedule A and the source.');
  assert.equal(explicit.references[0].target.logicalId, roots.at(-1).logicalId);
  assert.equal(explicit.text.slice(explicit.references[0].start, explicit.references[0].end), 'Schedule A');
  assert.equal(explicit.text.slice(explicit.references[1].start, explicit.references[1].end), 'source');
  const markers = roots.flatMap(root => root.content.flatMap(entry => entry.references ?? [])).filter(ref => ref.target.footnoteId === note.logicalId);
  assert.equal(markers.length, 2); assert.notEqual(markers[0].logicalId, markers[1].logicalId);
  assert(irregularOutline.kinds.find(kind => kind.kindCode === 'article').allowedChildKinds.includes('sentence'));
  assert.deepEqual(roots, irregularRoots('contract'), 'Generation is deterministic');
});
test('the successor moves existing identities and includes an addition/removal without renumbering labels', () => {
  const before = irregularRoots('lineage'); const after = irregularRoots('lineage', true);
  assert.equal(before[1].logicalId, after[2].logicalId);
  assert.equal(before[2].logicalId, after[1].logicalId);
  const moved = before[3].content.find(e => e.node?.kind === 'clause').node;
  assert(after[2].content.some(e => e.node?.logicalId === moved.logicalId));
  assert(!after[3].content.some(e => e.node?.logicalId === moved.logicalId));
  assert.equal(after[2].label, 'Art. I a');
  assert(!after[2].content.some(e => e.node?.label === 'bis'));
  assert(after[3].content.some(e => e.node?.label === 'ter'));
  const changed = structuredClone(before); changed[1].content[0].lineBreaksBefore = 2;
  assert.notDeepEqual(comparableRoots(before), comparableRoots(changed), 'Saved line breaks are part of fidelity verification');
  changed[1].content[0].lineBreaksBefore = 0; changed[3].content.at(-1).annotation.attribution = 'Different archive';
  assert.notDeepEqual(comparableRoots(before), comparableRoots(changed), 'Attribution is part of fidelity verification');
});
test('completed workflow seeding never overwrites later human edits or repeats publication', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'atlas-fixture-contract-'));
  try {
    const journal = journalAt(directory, 'http://localhost|deployment-one'); let value = null; let writes = 0;
    const steps = [async () => { writes++; value = { id: 'session', status: 'open', text: 'Fixture draft' }; }, async () => { writes++; value.status = 'approved'; }];
    const run = verifyOnly => seedWorkflow({ key: 'workflow', observe: async () => value, steps, journal, verifyOnly });
    await run(false); assert.equal(writes, 2);
    await run(false); assert.equal(writes, 2);
    value.text = 'Human edit'; value.status = 'published';
    const result = await run(false); assert.equal(result.preserved, true); assert.equal(value.text, 'Human edit'); assert.equal(writes, 2);
    await run(true); assert.equal(writes, 2, 'Verify-only makes no domain writes');
    assert.equal(journalAt(directory, 'http://localhost|deployment-two').data.scenarios.workflow, undefined, 'A reset stack gets a distinct journal');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('an interrupted seed resumes only while its last observed state is unchanged', async () => {
  const journal = { data: { scenarios: {} }, save() {} }; let value = null; let fail = true; let writes = 0;
  const steps = [async () => { value = { id: 'draft', text: 'Original' }; writes++; }, async () => { if (fail) throw new Error('outage'); value.text = 'Seed continuation'; writes++; }];
  const run = () => seedWorkflow({ key: 'draft', observe: async () => value, steps, journal, verifyOnly: false });
  await assert.rejects(run(), /outage/); fail = false; await run(); assert.equal(writes, 2);
  const journal2 = { data: { scenarios: {} }, save() {} }; value = null; fail = true;
  await assert.rejects(seedWorkflow({ key: 'other', observe: async () => value, steps, journal: journal2 }), /outage/);
  value.text = 'Edited during outage'; fail = false;
  const result = await seedWorkflow({ key: 'other', observe: async () => value, steps, journal: journal2 });
  assert.equal(result.preserved, true); assert.equal(value.text, 'Edited during outage');
});
test('existing work without a local journal is preserved and missing verify-only work fails', async () => {
  const journal = { data: { scenarios: {} }, save() {} };
  const result = await seedWorkflow({ key: 'owned', observe: async () => ({ id: 'existing' }), steps: [async () => assert.fail('must not mutate')], journal });
  assert.equal(result.preserved, true);
  await assert.rejects(seedWorkflow({ key: 'missing', observe: async () => null, steps: [], journal, verifyOnly: true }), /missing scenario/);
});
test('pagination verifies records past 200 and fails if an endpoint ignores offset', async () => {
  const records = Array.from({ length: 225 }, (_, id) => ({ id: String(id) }));
  let calls = 0;
  const api = async (_method, path) => { calls++; const query = new URL(path, 'http://local').searchParams; return records.slice(Number(query.get('offset')), Number(query.get('offset')) + Number(query.get('limit'))); };
  assert.equal((await allPages(api, 'content/articles?includeBody=true')).length, 225); assert.equal(calls, 3);
  await assert.rejects(allPages(async () => records.slice(0, 100), 'content/articles'), /repeated a page/);
});

test('deployed exploration fixtures need their target journal before any scenario can be seeded again', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'atlas-deployed-fixtures-'));
  try {
    let existing = true;
    const ctx = { profile: 'extended', deploymentEnvironment: 'test', baseUrl: new URL('https://example.test'), runtimeDir: directory,
      api: async (method, path) => {
        assert.equal(method, 'GET', 'Journal preflight must not perform a domain write');
        return path === 'identity/me' ? { id: 'admin-one' } : { constitutions: existing ? [{ slug: 'atlas-explore-v1-reader-lab' }] : [] };
      } };
    await assert.rejects(prepareScenarioJournal(ctx), /Restore its saved fixture journal/);
    existing = false;
    const first = await prepareScenarioJournal(ctx);
    assert.equal(first.existed, false);
    existing = true;
    assert.equal((await prepareScenarioJournal(ctx)).existed, true, 'Even a failed first seed retains an empty checkpoint');
    await assert.rejects(prepareScenarioJournal({ ...ctx, api: async (method, path) => path === 'identity/me' ? { id: 'different-deployment' } : { constitutions: [{ slug: 'atlas-explore-v1-reader-lab' }] } }), /Restore/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('a lost setup-proposal response is never automatically submitted twice', async () => {
  const journal = { data: { scenarios: {} }, save() {} };
  let posts = 0;
  const ctx = { journal, api: async method => { assert.equal(method, 'POST'); posts++; throw new Error('response lost after creation'); } };
  const scenario = scenarios.find(item => item.key === 'setup-proposal');
  await assert.rejects(setupWorkflow(ctx, scenario), /response lost/);
  await assert.rejects(setupWorkflow(ctx, scenario), /proposal creation was interrupted/);
  assert.equal(posts, 1, 'Retry must not create a duplicate pending proposal');
});

test('a rejected setup request can be retried after credentials or permissions are corrected', async () => {
  const journal = { data: { scenarios: {} }, save() {} };
  let forbidden = true, created = 0;
  const scenario = scenarios.find(item => item.key === 'setup-proposal');
  const ctx = { journal, api: async method => {
    if (method === 'POST') {
      if (forbidden) throw Object.assign(new Error('Forbidden'), { status: 403 });
      created++; return { id: 'proposal' };
    }
    return { status: 'proposed', payload: { constitutionSlug: 'atlas-explore-v1-setup-proposal' } };
  } };
  await assert.rejects(setupWorkflow(ctx, scenario), /Forbidden/);
  assert.equal(journal.data.scenarios[scenario.key], undefined);
  forbidden = false;
  assert.equal((await setupWorkflow(ctx, scenario)).proposalId, 'proposal');
  assert.equal(created, 1);
});
