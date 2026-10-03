import { describe, expect, it } from 'vitest';
import { treeUnits } from './AmendmentChangesTable';
import type { ArticleSummary } from '../../../lib/api';

describe('treeUnits', () => {
  it('exposes exact node and parent-text identities with snapshot permalinks', () => {
    const roots: ArticleSummary[] = [{
      id: 'root-occurrence', versionId: 'version-1', articleNumber: '46a', title: 'Rights', sortOrder: 1,
      kind: 'article', logicalId: 'root-logical', revisionId: 'root-revision', body: 'Before. Between.',
      content: [
        { type: 'text', logicalId: 'parent-text', revisionId: 'parent-revision', occurrenceId: 'parent-occurrence', text: 'Before.' },
        { type: 'child', node: { logicalId: 'sentence', revisionId: 'sentence-revision', occurrenceId: 'sentence-occurrence', kind: 'sentence', label: '(2a)', title: null, content: [{ type: 'text', logicalId: 'sentence-text', revisionId: 'sentence-text-revision', occurrenceId: 'sentence-text-occurrence', text: 'Nested wording.' }] } },
      ],
    }];

    const units = treeUnits('version-1', roots);
    expect(units.map((unit) => unit.logicalId)).toEqual(['root-logical', 'parent-text', 'sentence', 'sentence-text']);
    expect(units[1]).toMatchObject({ unitKind: 'text_entry', occurrenceId: 'parent-occurrence', rootOccurrenceId: 'root-occurrence' });
    expect(units[2]?.breadcrumbs).toEqual(['article 46a Rights', 'sentence (2a)']);
    expect(units[1]?.deepLink).toBe('/versions/version-1/units/root-occurrence?occurrenceId=parent-occurrence');
  });
});
