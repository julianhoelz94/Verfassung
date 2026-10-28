import { expect, it } from 'vitest';
import { indexDraftFootnotes } from './draft-footnotes';
import { footnoteEntries, footnoteItems } from './footnotes';

it('indexes nested constitution-end notes before projecting unloaded branches', () => {
  const roots = [{ logicalId: 'last', kind: 'article', content: [{ type: 'child' as const, node: { logicalId: 'parent', kind: 'paragraph', content: [{ type: 'text' as const, logicalId: 'note', format: 'footnote' as const, footnoteLabel: '†', text: 'Original note.' }] } }] }];
  expect(indexDraftFootnotes(roots)).toEqual([{ entry: roots[0].content[0].node.content[0], parentId: 'parent', rootId: 'last' }]);
  const entries = [{ type: 'text' as const, logicalId: 'note', occurrenceId: 'occurrence', format: 'footnote' as const, footnoteLabel: '†', text: 'Original note.' }];
  expect(footnoteEntries(entries)).toEqual(entries);
  expect(footnoteItems(entries, '/versions/pinned')).toEqual([{ logicalId: 'note', label: '†', text: 'Original note.', href: '/versions/pinned#fn-occurrence', marks: undefined }]);
});
