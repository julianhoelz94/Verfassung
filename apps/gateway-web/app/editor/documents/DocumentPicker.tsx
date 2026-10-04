'use client';

import { useState } from 'react';
import type { DocumentRecord, DocumentRevision } from '../../../lib/document-api';
import { attachDocumentAction } from './actions';

export function DocumentPicker(props: {
  documents: DocumentRecord[];
  revisions: DocumentRevision[][];
  targetType: 'constitution' | 'version' | 'amendment';
  targetId: string;
  scopeRevisionId?: string | null;
  returnTo: string;
}) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const visible = props.documents.filter((document) => document.revision.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const selectedIndex = props.documents.findIndex((document) => document.id === selectedId);
  const selected = selectedIndex >= 0 ? props.documents[selectedIndex] : null;
  return <div className="stack">
    <label htmlFor="linked-document-search">Search documents</label>
    <input id="linked-document-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
    <label htmlFor="linked-document-select">Select a document</label>
    <select id="linked-document-select" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
      <option value="">Choose a document</option>
      {visible.map((document) => <option key={document.id} value={document.id}>{document.revision.title}</option>)}
    </select>
    {selected ? <form action={attachDocumentAction} className="form-row">
      <input type="hidden" name="targetType" value={props.targetType} /><input type="hidden" name="targetId" value={props.targetId} />
      <input type="hidden" name="scopeRevisionId" value={props.scopeRevisionId ?? ''} />
      <input type="hidden" name="documentId" value={selected.id} /><input type="hidden" name="returnTo" value={props.returnTo} />
      <label htmlFor="linked-document-revision">Revision to cite</label>
      <select id="linked-document-revision" name="revisionId" defaultValue={selected.revision.id} key={selected.id}>
        {(props.revisions[selectedIndex] ?? []).map((revision) => <option key={revision.id} value={revision.id}>Revision {revision.revision}{revision.id === selected.revision.id ? ' (current)' : ''}</option>)}
      </select>
      <button type="submit">Attach</button>
    </form> : null}
  </div>;
}
