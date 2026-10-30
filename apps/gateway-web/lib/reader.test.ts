import { describe, expect, it } from 'vitest';
import type { ArticleSummary, ContentOutline } from './api';
import { readerChanges, readerPresentation, readReaderPreferences } from './reader';

const unit = (patch: Partial<ArticleSummary> = {}): ArticleSummary => ({ id: 'occurrence-a', logicalId: 'stable', versionId: 'v1', articleNumber: '1', title: 'Rights', kind: 'article', sortOrder: 0, body: 'Every person has rights.', ...patch });
describe('published reader comparisons', () => {
  it('pairs renamed and renumbered logical units rather than treating them as an unrelated addition', () => {
    const changes = readerChanges([unit()], [unit({ id: 'occurrence-b', articleNumber: '2', title: 'Equal rights', body: 'Every person has equal rights.' })]);
    expect(changes).toHaveLength(1); expect(changes[0]).toMatchObject({ kind: 'changed', fromRoot: 'occurrence-a', toRoot: 'occurrence-b', label: '2 · Equal rights' });
    expect(changes[0].segments.filter(item => item.type !== 'add').map(item => item.text).join('')).toBe('Every person has rights.');
    expect(changes[0].segments.filter(item => item.type !== 'remove').map(item => item.text).join('')).toBe('Every person has equal rights.');
  });
  it('finds additions and removals in both comparison directions and omits unchanged text', () => {
    const added = unit({ id: 'new', logicalId: 'new', articleNumber: '3' });
    expect(readerChanges([unit()], [unit(), added]).map(item => item.kind)).toEqual(['added']);
    expect(readerChanges([unit(), added], [unit()]).map(item => item.kind)).toEqual(['removed']);
    expect(readerChanges([unit()], [unit()])).toEqual([]);
  });
  it('detects structured formatting and reference changes even when the wording is identical', () => {
    const left = unit({ content: [{ type: 'text', text: 'Rights.', marks: [] }] });
    const right = unit({ content: [{ type: 'text', text: 'Rights.', marks: [{ type: 'bold', start: 0, end: 6 }] }] });
    expect(readerChanges([left], [right])[0]).toMatchObject({ kind: 'changed', presentationOnly: true });
  });
  it('reads nested legacy units when a root has no body and preserves line breaks', () => {
    const legacy = unit({ body: '', children: [{ id: 'n', kind: 'paragraph', label: null, number: null, title: null, sortOrder: 0, body: 'One.\nTwo.', children: [] }] });
    expect(readerChanges([], [legacy])[0].segments.map(item => item.text).join('')).toBe('One.\nTwo.');
  });
});

describe('reader-only presentation', () => {
  const outline: ContentOutline = { kinds: [
    { kindCode: 'article', displayLabel: 'Article', sortOrder: 0, mayHoldText: true, mayHoldChildren: true, allowedChildKinds: ['clause'], segmentation: 'none', presentation: 'section', showLabel: true, showTitle: true, showKind: true },
    { kindCode: 'clause', displayLabel: 'Custom wording', sortOrder: 1, mayHoldText: true, mayHoldChildren: false, allowedChildKinds: [], segmentation: 'sentence', presentation: 'concatenated', showLabel: false, showTitle: false, showKind: false },
  ] };
  it('changes only eligible configured sentence leaves and leaves the source settings untouched', () => {
    const lines = readerPresentation(outline, 'lines')!;
    expect(lines.kinds[0]).toBe(outline.kinds[0]); expect(lines.kinds[1].presentation).toBe('section');
    expect(outline.kinds[1].presentation).toBe('concatenated');
    expect(readerPresentation(lines, 'flowing')!.kinds[1].presentation).toBe('concatenated');
    expect(readerPresentation(outline, 'source')).toBe(outline); expect(readerPresentation(undefined, 'lines')).toBeUndefined();
  });
  it('does not apply sentence presentation to non-leaf levels even if a bad input requests segmentation', () => {
    const value = { kinds: [{ ...outline.kinds[0], segmentation: 'sentence' }] };
    expect(readerPresentation(value, 'flowing')!.kinds[0]).toEqual(value.kinds[0]);
  });
  it('validates saved preferences and ignores incompatible or injected fields', () => {
    expect(readReaderPreferences({ size: '20', presentation: 'lines', boundaries: true, navigation: false })).toEqual({ size: '20', presentation: 'lines', boundaries: true, navigation: false });
    for (const value of [null, false, 'bad', { size: '999', presentation: 'html', boundaries: 'true' }]) expect(readReaderPreferences(value)).toEqual({ size: '17', presentation: 'source', boundaries: false, navigation: true });
  });
});
