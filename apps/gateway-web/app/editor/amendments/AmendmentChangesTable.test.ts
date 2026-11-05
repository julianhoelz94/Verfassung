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
  it('exposes exact pinned identities without serializing an obsolete browser alias', () => {
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
    expect(units[1]).toMatchObject({ versionId: 'version-1', logicalId: 'parent-text', revisionId: 'parent-revision' });
    expect(units[1]?.deepLink).toBeUndefined();
  });
  it('keeps nested wording and table cells available in exact passage comparisons', () => {
    const roots: ArticleSummary[] = [{id:'root',versionId:'v',logicalId:'article',revisionId:'article-r',articleNumber:'1',title:'Rights',sortOrder:1,content:[
      {type:'child',node:{logicalId:'paragraph',revisionId:'paragraph-r',occurrenceId:'paragraph-o',kind:'paragraph',label:'(1)',title:null,content:[
        {type:'child',node:{logicalId:'sentence',revisionId:'sentence-r',occurrenceId:'sentence-o',kind:'sentence',label:null,title:null,content:[{type:'text',text:'Literal nested wording.'}]}},
        {type:'text',logicalId:'table',revisionId:'table-r',occurrenceId:'table-o',format:'table',lineBreaksBefore:1,table:{caption:'Official table',rows:[{logicalId:'row',cells:[{logicalId:'cell-1',text:'Civic duty'},{logicalId:'cell-2',text:'Required'}]}]}},
      ]}},
    ]}];
    const units=treeUnits('v',roots);
    expect(units.find(unit=>unit.logicalId==='paragraph')?.text).toBe('Literal nested wording.\nOfficial table\nCivic duty\tRequired');
    expect(units.find(unit=>unit.logicalId==='table')?.text).toBe('\nOfficial table\nCivic duty\tRequired');
  });

});
