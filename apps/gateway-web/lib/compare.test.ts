import { describe, expect, it } from 'vitest';
import type { Amendment, ArticleSummary, ConstitutionSummary, OrderedEntry, VersionSummary } from './api';
import {
  alignArticles,
  amendmentsBetween,
  canonicalCompareQuery,
  compareRequestError,
  neighborCompareLinks,
  netArticleKind,
  orderVersions,
  versionPath,
} from './compare';

const v = (id: string, label: string, effectiveDate: string | null = null): VersionSummary => ({
  id,
  versionLabel: label,
  effectiveDate,
  languageCode: 'de',
  sourceUrl: null,
  gazetteReference: null,
  provenance: 'imported',
  verificationState: 'unverified',
  verifiedBy: null,
  verifiedAt: null,
  latestPublished: false,
});

const constitution = (id: string, versions: VersionSummary[]): ConstitutionSummary => ({
  id,
  slug: id,
  title: id,
  versions,
});

describe('orderVersions', () => {
  it('uses canonical effective-date order in selectors', () => {
    const ordered = orderVersions([v('b', 'v2', '1950-01-01'), v('a', 'v1', '1949-05-23')]);
    expect(ordered.map((version) => version.id)).toEqual(['a', 'b']);
  });
});

describe('compareRequestError', () => {
  const gg = constitution('gg', [v('from', '1949', '1949-05-23'), v('mid', '1956', '1956-03-19'), v('to', '2022', '2022-01-01')]);
  const other = constitution('other', [v('x', 'v1', '1800-01-01')]);

  it('rejects the same version before any article fetch', () => {
    expect(compareRequestError([gg], 'from', 'from')).toMatch(/two different versions/);
  });

  it('rejects a backward path before any article fetch', () => {
    expect(compareRequestError([gg], 'to', 'from')).toMatch(/forward path/);
  });

  it('rejects a cross-constitution pair before any article fetch', () => {
    expect(compareRequestError([gg, other], 'from', 'x')).toMatch(/same constitution/);
  });

  it('accepts a forward path on one constitution', () => {
    expect(compareRequestError([gg], 'from', 'to')).toBeNull();
    expect(versionPath(gg.versions, 'from', 'to')?.map((version) => version.id)).toEqual(['from', 'mid', 'to']);
  });
});

describe('netArticleKind', () => {
  it('classifies multi-hop added-then-changed as added from the endpoints', () => {
    expect(
      netArticleKind(undefined, { id: '1', versionId: 'to', articleNumber: '1', title: 'A', sortOrder: 1, body: 'later' }, [
        'added',
        'changed',
      ]),
    ).toBe('added');
  });

  it('classifies changed-then-removed as removed from the endpoints', () => {
    expect(
      netArticleKind(
        { id: '1', versionId: 'from', articleNumber: '1', title: 'A', sortOrder: 1, body: 'old' },
        undefined,
        ['changed', 'removed'],
      ),
    ).toBe('removed');
  });

  it('uses body text when both ends exist', () => {
    expect(
      netArticleKind(
        { id: '1', versionId: 'from', articleNumber: '1', title: 'A', sortOrder: 1, body: 'old' },
        { id: '2', versionId: 'to', articleNumber: '1', title: 'A', sortOrder: 1, body: 'new' },
        [],
      ),
    ).toBe('changed');
  });
});

describe('structured endpoint comparison', () => {
  const root = (versionId: string, content?: OrderedEntry[]): ArticleSummary => ({
    id: `root-occurrence-${versionId}`,
    logicalId: 'preamble',
    revisionId: `root-revision-${versionId}`,
    versionId,
    kind: 'preamble',
    articleNumber: '',
    title: 'Preamble',
    sortOrder: 1,
    content: content ?? [{
      type: 'text',
      logicalId: 'preamble-text',
      revisionId: `text-revision-${versionId}`,
      occurrenceId: `text-occurrence-${versionId}`,
      text: 'We the people.',
    }],
  });

  it('keeps a republished preamble unchanged despite new revision, occurrence and provenance IDs', () => {
    const left = { ...root('from'), predecessorRevisionId: 'original-revision' };
    const right = { ...root('to'), predecessorRevisionId: left.revisionId };
    expect(netArticleKind(left, right, [])).toBe('same');
    // Recorded legal changes remain available in the amendment history, but
    // do not turn equal endpoint content into a net text change.
    expect(netArticleKind(left, right, ['changed'])).toBe('same');
  });

  it.each([
    ['root kind', { kind: 'appendix' }],
    ['root label', { articleNumber: 'A' }],
    ['root title', { title: 'Revised preamble' }],
  ])('detects a changed %s even when text and revision ID match', (_label, update) => {
    const left = root('from');
    expect(netArticleKind(left, { ...left, ...update }, [])).toBe('changed');
  });

  const referencedText = (): OrderedEntry => ({
    type: 'text',
    text: 'See source.',
    references: [{ logicalId: 'reference', start: 4, end: 10, target: { type: 'external', url: 'https://example.org/old' } }],
  });

  it.each([
    ['external URL', { type: 'external' as const, url: 'https://example.org/old' }, { type: 'external' as const, url: 'https://example.org/new' }],
    ['unit target', { type: 'unit' as const, logicalId: 'original-unit' }, { type: 'unit' as const, logicalId: 'different-unit' }],
    ['footnote target', { type: 'footnote' as const, footnoteId: 'original-note' }, { type: 'footnote' as const, footnoteId: 'different-note' }],
  ])('detects a changed reference %s with identical displayed text', (_label, originalTarget, target) => {
    const left = referencedText();
    left.references![0].target = originalTarget;
    const right = { ...left, references: [{ ...left.references![0], target }] };
    expect(netArticleKind(root('from', [left]), root('to', [right]), [])).toBe('changed');
  });

  it('detects a changed reference range but ignores the reference own identity', () => {
    const left = referencedText();
    const right = { ...left, references: [{ ...left.references![0], logicalId: 'republished-reference' }] };
    expect(netArticleKind(root('from', [left]), root('to', [right]), [])).toBe('same');
    right.references[0].start = 0;
    expect(netArticleKind(root('from', [left]), root('to', [right]), [])).toBe('changed');
  });

  it('ignores storage order of non-overlapping references while retaining their targets', () => {
    const left: OrderedEntry = {
      type: 'text', text: 'First and second.',
      references: [
        { logicalId: 'first', start: 0, end: 5, target: { type: 'external', url: 'https://example.org/first' } },
        { logicalId: 'second', start: 10, end: 16, target: { type: 'external', url: 'https://example.org/second' } },
      ],
    };
    const right = { ...left, references: [...left.references!].reverse() };
    expect(netArticleKind(root('from', [left]), root('to', [right]), [])).toBe('same');
    expect(left.references!.map(reference => reference.logicalId)).toEqual(['first', 'second']);
    expect(right.references.map(reference => reference.logicalId)).toEqual(['second', 'first']);
  });

  it('detects annotation meaning changes while ignoring anchor storage order', () => {
    const annotation: NonNullable<OrderedEntry['annotation']> = { kind: 'editorial', attribution: 'Archive editor', sourceUrl: 'https://example.org/source', anchorLogicalIds: ['unit-a', 'unit-b'] };
    const left: OrderedEntry = { type: 'text', text: 'Archive note.', format: 'footnote', annotation };
    const right = { ...left, annotation: { ...annotation, anchorLogicalIds: ['unit-b', 'unit-a'] } };
    expect(netArticleKind(root('from', [left]), root('to', [right]), [])).toBe('same');
    for (const update of [{ kind: 'source' as const }, { attribution: 'Another editor' }, { sourceUrl: 'https://example.org/revised' }, { anchorLogicalIds: ['unit-c'] }]) {
      expect(netArticleKind(root('from', [left]), root('to', [{ ...right, annotation: { ...right.annotation, ...update } }]), [])).toBe('changed');
    }
  });

  const table = (): OrderedEntry => ({
    type: 'text',
    format: 'table',
    table: {
      caption: 'Allocation',
      rows: [{ logicalId: 'row', cells: [
        { logicalId: 'heading', text: 'Seat', header: true },
        { logicalId: 'value', text: 'One', headers: ['heading'] },
      ] }],
    },
  });

  it.each([
    ['header', { header: true }],
    ['row span', { rowSpan: 2 }],
    ['column span', { colSpan: 2 }],
    ['header association', { headers: [] }],
  ])('detects a table %s change without changing the cell text', (_label, update) => {
    const left = table();
    const right = table();
    Object.assign(right.table!.rows[0].cells[1], update);
    expect(netArticleKind(root('from', [left]), root('to', [right]), [])).toBe('changed');
  });

  it('compares table captions, cell order and row boundaries', () => {
    const left = table();
    const caption = table();
    caption.table!.caption = 'Revised allocation';
    expect(netArticleKind(root('from', [left]), root('to', [caption]), [])).toBe('changed');
    const reordered = table();
    reordered.table!.rows[0].cells.reverse();
    expect(netArticleKind(root('from', [left]), root('to', [reordered]), [])).toBe('changed');
    const splitRows = table();
    splitRows.table!.rows = splitRows.table!.rows[0].cells.map((cell, index) => ({ logicalId: `row-${index}`, cells: [cell] }));
    expect(netArticleKind(root('from', [left]), root('to', [splitRows]), [])).toBe('changed');
  });

  it('normalizes optional defaults and redundant table text', () => {
    const left = table();
    const right = table();
    right.text = 'Seat One';
    Object.assign(right.table!.rows[0].cells[0], { rowSpan: 1, colSpan: 1, headers: [] });
    Object.assign(right.table!.rows[0].cells[1], { header: false, rowSpan: 1, colSpan: 1 });
    expect(netArticleKind(root('from', [left]), root('to', [right]), [])).toBe('same');
    const plain = root('to');
    Object.assign(plain.content![0], { format: 'plain', table: null, footnoteLabel: null, references: [] });
    expect(netArticleKind(root('from'), plain, [])).toBe('same');
  });

  const child = (versionId: string, label = '1'): OrderedEntry => ({
    type: 'child',
    node: {
      logicalId: `paragraph-${label}`,
      revisionId: `child-revision-${versionId}-${label}`,
      occurrenceId: `child-occurrence-${versionId}-${label}`,
      kind: 'paragraph',
      label,
      title: null,
      content: root(versionId).content!,
    },
  });

  it('compares nested content recursively without revision or occurrence IDs', () => {
    expect(netArticleKind(root('from', [child('from')]), root('to', [child('to')]), [])).toBe('same');
    const changed = child('to');
    changed.node!.content[0].text = 'We all the people.';
    expect(netArticleKind(root('from', [child('from')]), root('to', [changed]), [])).toBe('changed');
  });

  it.each([
    ['kind', { kind: 'sentence' }],
    ['label', { label: '2' }],
    ['title', { title: 'New title' }],
  ])('detects nested %s changes with identical flattened text', (_label, update) => {
    const changed = child('to');
    Object.assign(changed.node!, update);
    expect(netArticleKind(root('from', [child('from')]), root('to', [changed]), [])).toBe('changed');
  });

  it('preserves child order and hierarchy with identical flattened text', () => {
    const left = root('from', [child('from', '1'), child('from', '2')]);
    const right = root('to', [child('to', '2'), child('to', '1')]);
    expect(netArticleKind(left, right, [])).toBe('changed');
    expect(netArticleKind(root('from', [child('from')]), root('to'), [])).toBe('changed');
  });

  it('detects footnote format and marker changes', () => {
    const left = { type: 'text' as const, text: 'Note text.', format: 'footnote' as const, footnoteLabel: '1' };
    expect(netArticleKind(root('from', [left]), root('to', [{ ...left, format: 'plain' }]), [])).toBe('changed');
    expect(netArticleKind(root('from', [left]), root('to', [{ ...left, footnoteLabel: '2' }]), [])).toBe('changed');
  });

  it('retains the recorded change fallback for legacy summaries without structured content', () => {
    const left = { ...root('from'), content: undefined };
    const right = { ...root('to'), content: undefined };
    expect(netArticleKind(left, right, ['changed'])).toBe('changed');
  });
});

describe('neighborCompareLinks', () => {
  const versions = [v('a', '1949', '1949-05-23'), v('b', '1956', '1956-03-19'), v('c', '2022', '2022-01-01')];

  it('exposes previous and next compare shortcuts on a middle version', () => {
    const links = neighborCompareLinks('DE', versions, 'b');
    expect(links.previous?.href).toContain('from=a');
    expect(links.previous?.href).toContain('to=b');
    expect(links.next?.href).toContain('from=b');
    expect(links.next?.href).toContain('to=c');
  });
});

describe('canonicalCompareQuery', () => {
  const versions = [v('a', '1949', '1949-05-23'), v('b', '1956', '1956-03-19'), v('c', '2022', '2022-01-01')];

  it('orders ids with the earlier version as from', () => {
    expect(canonicalCompareQuery('c', 'a', versions)).toEqual({ from: 'a', to: 'c' });
    expect(canonicalCompareQuery('a', 'c', versions)).toEqual({ from: 'a', to: 'c' });
  });

  it('returns null for unknown or identical ids', () => {
    expect(canonicalCompareQuery('a', 'a', versions)).toBeNull();
    expect(canonicalCompareQuery('missing', 'a', versions)).toBeNull();
    expect(canonicalCompareQuery(undefined, 'a', versions)).toBeNull();
  });
});


const amendment = (
  id: string,
  sourceId: string,
  targetId: string,
  status = 'published',
): Amendment => ({
  id,
  title: id,
  summary: '',
  enactedOn: '2022-01-01',
  sourceReference: null,
  sourceVersionId: sourceId,
  targetVersionId: targetId,
  status,
  changes: [],
});

describe('amendmentsBetween', () => {
  const versions = [v('a', '1949', '1949-05-23'), v('b', '1956', '1956-03-19'), v('c', '2022', '2022-01-01')];

  it('returns published laws on the forward public path between two versions', () => {
    const laws = [
      amendment('law-1', 'a', 'b'),
      amendment('law-2', 'b', 'c'),
      amendment('outside', 'a', 'c'),
    ];
    expect(amendmentsBetween(laws, 'a', 'c', versions).map((item) => item.id)).toEqual([
      'law-1',
      'outside',
      'law-2',
    ]);
  });

  it('skips amendments missing source or target ids and non-published rows', () => {
    const laws = [
      amendment('draft', 'a', 'b', 'draft'),
      { ...amendment('missing', 'a', 'b'), sourceVersionId: null },
      amendment('kept', 'a', 'b'),
    ];
    expect(amendmentsBetween(laws, 'a', 'b', versions).map((item) => item.id)).toEqual(['kept']);
  });
});


describe('stable ordered root alignment', () => {
  it('pairs renumbered and unlabeled roots by logical identity in target order', () => {
    const root = (id: string, logicalId: string, articleNumber: string) => ({ id, logicalId, versionId: id, articleNumber, title: '', sortOrder: 1 });
    const left = [root('old-a', 'a', '46a'), root('old-b', 'b', ''), root('old-c', 'c', '')];
    const right = [root('new-c', 'c', ''), root('new-a', 'a', 'bis'), root('new-b', 'b', '')];
    const aligned = alignArticles(left, right);
    expect(aligned.map((pair) => [pair.key, pair.left?.id, pair.right?.id])).toEqual([
      ['c', 'old-c', 'new-c'], ['a', 'old-a', 'new-a'], ['b', 'old-b', 'new-b'],
    ]);
  });
});


describe('legacy ordered identity compatibility', () => {
  const root = (id: string, body: string, legacyIdentity: boolean) => ({ id, logicalId: `logical-${id}`, revisionId: `revision-${id}`, legacyIdentity, versionId: id, articleNumber: '46a', title: 'Rights', sortOrder: 1, content: [{ type: 'text' as const, text: body }] });
  it('pairs independently imported legacy roots by literal label and compares ordered text', () => {
    const left = root('source', 'Old wording.', true);
    const right = root('target', 'New wording.', true);
    const [pair] = alignArticles([left], [right]);
    expect(pair?.left).toBe(left);
    expect(pair?.right).toBe(right);
    expect(netArticleKind(pair?.left, pair?.right, [])).toBe('changed');
    expect(netArticleKind(left, root('same', 'Old wording.', true), [])).toBe('same');
  });
  it('keeps distinct canonical roots added and removed despite matching labels and text', () => {
    const pairs = alignArticles([root('source', 'Same wording.', false)], [root('target', 'Same wording.', false)]);
    expect(pairs.map((pair) => netArticleKind(pair.left, pair.right, []))).toEqual(['added', 'removed']);
  });
});


it('reserves stable identities before a renumbered legacy label collision', () => {
  const source = { id: 'source', logicalId: 'stable', legacyIdentity: true, versionId: 'old', articleNumber: '1', title: '', sortOrder: 1 };
  const newcomer = { ...source, id: 'newcomer', logicalId: 'new' };
  const successor = { ...source, id: 'successor', articleNumber: '2' };
  const pairs = alignArticles([source], [newcomer, successor]);
  expect(pairs[0]?.left).toBeUndefined();
  expect(pairs[1]?.left).toBe(source);
});
