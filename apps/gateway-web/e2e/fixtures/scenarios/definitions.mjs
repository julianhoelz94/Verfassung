import { createHash } from 'node:crypto';

export const namespace = 'atlas-explore-v1';
export function stableId(key) {
  const hex = createHash('sha256').update(`${namespace}:${key}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
export const simpleOutline = { kinds: [{ kindCode: 'article', displayLabel: 'Article', showTitle: true, showKind: true }] };
export function rootsFor(key, count = 2, language = 'en') {
  return Array.from({ length: count }, (_, i) => ({ logicalId: stableId(`${key}:unit:${i}`), kind: 'article', label: String(i + 1), title: `Exploration provision ${i + 1}`,
    content: [{ type: 'text', logicalId: stableId(`${key}:text:${i}`), text: language === 'de' ? `Die Freiheit bleibt geschützt. Suchprobe ${i + 1}.` : `Explorationneedle provision ${i + 1} protects civic freedom.` }] }));
}
export function richRoots(key, changed = false) {
  const roots = rootsFor(key);
  const noteId = stableId(`${key}:note`);
  for (const [i, root] of roots.entries()) {
    const entry = root.content[0];
    entry.text = `Freedom [a] belongs to every person in provision ${i + 1}.`;
    entry.references = [{ logicalId: stableId(`${key}:marker:${i}`), start: 8, end: 11, target: { type: 'footnote', footnoteId: noteId } }];
    entry.marks = [{ type: 'bold', start: 0, end: 7 }];
    root.content.push({ type: 'text', logicalId: stableId(`${key}:break:${i}`), text: 'A separate line retains its authored spacing.', lineBreaksBefore: i + 1,
      marks: [{ type: 'italic', start: 2, end: 10 }, { type: 'underline', start: 11, end: 15 }, { type: 'strikethrough', start: 16, end: 23 }] });
  }
  roots[1].content.push({ type: 'text', logicalId: stableId(`${key}:table`), format: 'table', table: { caption: 'Exploration duties', rows: [
    { logicalId: stableId(`${key}:header`), cells: [{ logicalId: stableId(`${key}:duty`), text: 'Duty', header: true }, { logicalId: stableId(`${key}:period`), text: 'Period', header: true }] },
    ...Array.from({ length: 8 }, (_, i) => ({ logicalId: stableId(`${key}:row:${i}`), cells: [
      { logicalId: stableId(`${key}:duty:${i}`), text: `Civic duty ${i + 1}`, headers: [stableId(`${key}:duty`)] },
      { logicalId: stableId(`${key}:period:${i}`), text: changed && i === 0 ? 'Biennial' : 'Annual', headers: [stableId(`${key}:period`)] },
    ] })),
    { logicalId: stableId(`${key}:span`), cells: [{ logicalId: stableId(`${key}:span:cell`), text: 'Applies to everyone', colSpan: 2 }] },
  ] } });
  roots[1].content.push({ type: 'text', logicalId: noteId, text: changed ? 'Revised shared editorial note.' : 'Shared editorial note for two articles.', format: 'footnote', footnoteLabel: '[a]',
    annotation: { kind: 'editorial', attribution: 'Constitution Atlas synthetic fixtures', sourceUrl: 'https://example.org/atlas-explore/note', anchorLogicalIds: roots.map(root => root.content[0].logicalId) } });
  return roots;
}
export const irregularOutline = { kinds: [
  { kindCode: 'preamble', displayLabel: 'Preamble', root: true, allowedChildKinds: [], labelPolicy: 'optional', titlePolicy: 'optional' },
  { kindCode: 'article', displayLabel: 'Article', root: true, allowedChildKinds: ['paragraph', 'sentence', 'clause'], allowTextAlongsideChildren: true, titlePolicy: 'optional', showTitle: true },
  { kindCode: 'paragraph', displayLabel: 'Paragraph', root: false, allowedChildKinds: ['sentence'], allowTextAlongsideChildren: true, titlePolicy: 'optional' },
  { kindCode: 'sentence', displayLabel: 'Sentence', root: false, allowedChildKinds: [], presentation: 'concatenated', showLabel: false },
  { kindCode: 'appendix', displayLabel: 'Schedule', root: true, allowedChildKinds: ['clause'], allowTextAlongsideChildren: true, titlePolicy: 'optional', showTitle: true },
  { kindCode: 'clause', displayLabel: 'Clause', root: false, allowedChildKinds: [], labelPolicy: 'optional', titlePolicy: 'optional' },
] };
export function irregularRoots(key, changed = false) {
  const [first, second] = richRoots(key, changed);
  const note = second.content.pop();
  const table = second.content.pop();
  const text = (name, wording) => ({ type: 'text', logicalId: stableId(`${key}:${name}`), text: wording });
  const child = (name, kind, label, content) => ({ type: 'child', node: { logicalId: stableId(`${key}:${name}`), kind, label, title: null, content } });
  first.label = 'Art. I a'; first.title = null;
  first.content.push(child('paragraph', 'paragraph', '(1)', [text('parent-wording', 'Parent text before a child sentence.'), child('sentence-nested', 'sentence', '1', [text('nested-wording', 'A nested sentence preserves its own identity.')]), text('parent-after', 'Parent text after its child.')]));
  first.content.push(text('between', 'Unnumbered text between provisions.'));
  first.content.push(child('sentence-direct', 'sentence', null, [text('direct-wording', 'This sentence skips the optional paragraph level.')]));
  const removed = child('removed-clause', 'clause', 'bis', [text('removed-wording', 'This clause is removed in the successor.')]);
  if (!changed) first.content.push(removed);
  second.label = null; second.title = 'Unnumbered supplementary rights';
  const moving = child('moving-clause', 'clause', null, [text('moving-wording', 'This untitled clause changes parent in the successor.')]);
  if (changed) first.content.push(moving);
  const appendix = { logicalId: stableId(`${key}:appendix`), kind: 'appendix', label: 'Schedule A', title: null, content: [text('appendix-intro', 'A schedule follows a different hierarchy.'), table, ...(!changed ? [moving] : []), ...(changed ? [child('added-clause', 'clause', 'ter', [text('added-wording', 'A newly added schedule clause.')])] : []), note] };
  const preamble = { logicalId: stableId(`${key}:preamble`), kind: 'preamble', label: null, title: null, content: [text('preamble-wording', 'An untitled and unnumbered preamble opens the instrument.')] };
  return changed ? [preamble, second, first, appendix] : [preamble, first, second, appendix];
}
const descriptions = [
  ['reader-lab', 'content', 'Non-standard layouts, shared footnotes and tables', 'viewer', 'Open both articles, follow the two [a] markers, inspect the table and compare the versions.', 'Mixed roots, skipped levels, interleaved text, literal labels and structural moves survive publication.'],
  ['history-lab', 'history', 'Legal versions and text corrections', 'viewer', 'Open the original and both corrections, then compare with the next legal version.', 'Old snapshots retain their text; corrections share one legal identity.'],
  ...['draft', 'review', 'approved', 'published', 'archived'].map(state => [`editor-${state}`, 'editor', `Editorial work: ${state}`, state === 'review' ? 'reviewer' : state === 'approved' ? 'publisher' : 'editor', 'Open the saved session and continue its editorial workflow.', `The session begins in ${state}; later manual progress is preserved.`]),
  ['source-returned', 'source', 'Source correction with requested changes', 'editor', 'Read the reviewer feedback, revise the source description and submit it again.', 'The reason and review history remain separate from constitutional text.'],
  ...['outline', 'review', 'approved', 'rejected'].map(state => [`import-${state}`, 'import', `Import: ${state}`, state === 'review' ? 'reviewer' : state === 'approved' ? 'publisher' : 'editor', 'Inspect the import preview, structure and review decision.', `The import starts at ${state}; unpublished text is private.`]),
  ['setup-proposal', 'setup', 'Structure awaiting confirmation', 'admin', 'Review the representative sample and confirm the structure.', 'Confirmation enables upload without publishing constitutional text.'],
  ...['review', 'published', 'withdrawn', 'stale'].map(state => [`amendment-${state}`, 'amendment', `Amendment evidence: ${state}`, state === 'review' ? 'reviewer' : 'publisher', 'Inspect exact affected passages, diff decisions and revision history.', `The legal record is ${state}; published evidence retains exact snapshot pins.`]),
  ['documents-context', 'context', 'Files, pictures and context drafts', 'editor', 'Download source files, inspect their revisions and open the unpublished context draft.', 'Published context, document revisions and legal text have independent histories.'],
  ['historical-region', 'archive', 'Regional archive and lifecycle', 'viewer', 'Browse the historical jurisdiction, annotations, lifecycle and legacy link.', 'Unknown dates stay unknown; source wording and literal labels remain intact.'],
  ['curated-comparison', 'comparison', 'Curated comparison with a missing counterpart', 'viewer', 'Select each topic and inspect its authored correspondences.', 'A missing counterpart is explicit and columns pin different constitutions.'],
  ['search-pagination', 'search', 'Search across pages and languages', 'viewer', 'Search Explorationneedle, paginate, then filter to the German version.', 'Results preserve their jurisdiction and exact version context.'],
  ['scale-pagination', 'scale', '225 provisions across API pages', 'viewer', 'Read and search provisions beyond the first 200.', 'Upload and verification follow every page without truncation.'],
];
export const scenarios = descriptions.map(([key, kind, title, role, action, expected]) => ({ key, kind, title, role, action, expected,
  profile: kind === 'scale' ? 'scale' : 'extended', dependencies: kind === 'comparison' ? ['reader-lab', 'historical-region', 'documents-context'] : [],
  intendedState: ['editor', 'import', 'amendment'].includes(kind) ? key.replace(/^(editor|import|amendment)-/, '') : kind === 'setup' ? 'proposed' : kind === 'source' ? 'returned' : kind === 'context' ? 'draft' : 'published',
}));
export function selectedScenarios(profile) {
  if (!['compact', 'extended', 'scale'].includes(profile)) throw new Error(`Unknown fixture profile '${profile}'; use compact, extended or scale`);
  return profile === 'compact' ? [] : scenarios.filter(s => profile === 'scale' || s.profile !== 'scale');
}
export function parseOptions(args, env = process.env) {
  let profile = env.PREPOPULATE_PROFILE || (env.PREPOPULATE_DEPLOYMENT_ENVIRONMENT ? 'compact' : 'extended');
  let verifyOnly = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--verify-only') verifyOnly = true;
    else if (args[i] === '--profile' && args[i + 1]) profile = args[++i];
    else if (args[i].startsWith('--profile=')) profile = args[i].slice(10);
    else throw new Error(`Unknown prepopulate option '${args[i]}'`);
  }
  selectedScenarios(profile);
  return { profile, verifyOnly };
}
