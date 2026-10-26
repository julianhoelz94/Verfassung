import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { treeUnits } from './AmendmentChangesTable';
import { AmendmentForm } from './AmendmentForm';
import type { ArticleSummary } from '../../../lib/api';

vi.mock('./actions', () => ({ suggestChangesAction: vi.fn() }));

it('preserves a pending unit target when an amendment draft is reopened and saved', () => {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(createElement(AmendmentForm, {
    amendmentId: 'amendment', constitutionId: 'constitution', versions: [], articlesByVersion: {}, unitTreesByVersion: {},
    canSave: true, canWithdraw: false, readOnly: false,
    amendment: {
      id: 'amendment', title: 'Law', summary: '', enactedOn: null, sourceReference: null,
      changes: [{ id: 'change', articleId: 'article', articleNumber: '1', changeType: 'added', note: null, pendingAfterLogicalId: 'draft-unit' }],
    },
  }));
  const changes = JSON.parse(host.querySelector<HTMLInputElement>('[name="changesJson"]')!.value);
  expect(changes[0]).toMatchObject({ afterRef: null, pendingAfterLogicalId: 'draft-unit' });
});

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
    expect(units[2]?.breadcrumbs).toEqual(['Article 46a Rights', 'Sentence (2a)']);
    expect(units[1]?.deepLink).toBe('/versions/version-1/units/root-occurrence?occurrenceId=parent-occurrence');
  });
});
