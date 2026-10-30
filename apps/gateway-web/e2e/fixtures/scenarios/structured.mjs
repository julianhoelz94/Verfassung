import assert from 'node:assert/strict';
import { allPages, seedWorkflow, comparableRoots } from './runtime.mjs';
import { ensurePublished, payloadFor } from './content.mjs';
import { stableId, irregularRoots, irregularOutline } from './definitions.mjs';

export async function structuredScenario(ctx, scenario) {
  const source = await ensurePublished(ctx, scenario.key, payloadFor(scenario, irregularRoots(scenario.key), { outline: irregularOutline }));
  const observe = async () => {
    const sessions = [...await allPages(ctx.api, `editor/edit-sessions?versionId=${source.versionId}`), ...await allPages(ctx.api, `editor/edit-sessions?versionId=${source.versionId}&archived=true`)];
    assert(sessions.length <= 1, `${scenario.key}: ambiguous sessions`);
    if (!sessions[0]) return null;
    const preview = await ctx.api('GET', `editor/edit-sessions/${sessions[0].id}`);
    const structured = await ctx.api('GET', `editor/edit-sessions/${sessions[0].id}/structured-draft`);
    return { ...preview, structured };
  };
  const paragraph = source.snapshot.roots[1].content.find(entry => entry.node?.kind === 'paragraph').node;
  const original = paragraph.content[0];
  const splitId = stableId(`${scenario.key}:split`), mergeId = stableId(`${scenario.key}:merge`);
  const firstId = stableId(`${scenario.key}:first-part`), secondId = stableId(`${scenario.key}:second-part`), mergedId = stableId(`${scenario.key}:merged`);
  const wording = 'Saved draft: parent wording around a child sentence.';
  const operations = [
    { id: splitId, type: 'split_text', targetId: original.logicalId, expectedRevisionId: original.revisionId,
      parts: [{ logicalId: firstId, text: original.text.slice(0, 12) }, { logicalId: secondId, text: original.text.slice(12) }] },
    { id: mergeId, type: 'merge_text', targetId: firstId, expectedRevisionId: splitId, mergeIds: [firstId, secondId], parts: [{ logicalId: mergedId, text: original.text }] },
    { id: stableId(`${scenario.key}:wording`), type: 'replace_text', targetId: mergedId, expectedRevisionId: mergeId, text: wording, format: 'plain', lineBreaksBefore: 1, marks: [{ type: 'bold', start: 0, end: 5 }] },
    { id: stableId(`${scenario.key}:move`), type: 'move_root', targetId: source.snapshot.roots[2].logicalId, expectedRevisionId: source.snapshot.roots[2].revisionId, position: 1 },
  ];
  const steps = [() => ctx.api('POST', 'editor/edit-sessions', { versionId: source.versionId, hopKind: 'editorial_correction' }, ctx.editorToken), current => ctx.api('POST', `editor/edit-sessions/${current.session.id}/structured-saves`, { expectedGeneration: 0, operations }, ctx.editorToken), current => ctx.api('POST', `editor/edit-sessions/${current.session.id}/publish-details`, { comment: 'Explore a saved irregular draft with text lineage, formatting and root moves.' }, ctx.editorToken)];
  const result = await seedWorkflow({ key: scenario.key, observe, steps, journal: ctx.journal, verifyOnly: ctx.verifyOnly });
  assert(result.value, `${scenario.key}: saved structured work missing`);
  if (!result.preserved) {
    assert.equal(result.value.session.status, 'open');
    assert.deepEqual(result.value.structured.operations.map(op => op.type), ['split_text', 'merge_text', 'replace_text', 'move_root']);
    assert.equal(result.value.structured.roots[1].logicalId, source.snapshot.roots[2].logicalId);
    const editedParagraph = result.value.structured.roots[2].content.find(entry => entry.node?.kind === 'paragraph').node;
    assert.equal(editedParagraph.content[0].text, wording);
    assert.equal(editedParagraph.content[0].lineBreaksBefore, 1);
    assert.equal(result.value.structured.roots.at(-1).content.at(-1).footnoteLabel, '[a]');
  }
  const unchanged = await ctx.api('GET', `content/versions/${source.versionId}/content`, undefined, false);
  assert.deepEqual(comparableRoots(unchanged.roots), comparableRoots(source.snapshot.roots), 'Structured draft preserves the published source');
  return { ...source, ...result, sessionId: result.value.session.id, href: `/editor?sessionId=${result.value.session.id}`, state: result.value.session.status };
}
