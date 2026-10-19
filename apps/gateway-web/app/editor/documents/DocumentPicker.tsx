'use client';

import { T } from '../../components/TranslationProvider';
import { ui } from '../../../lib/messages';
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
  const [attaching, setAttaching] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const visible = props.documents.filter((document) => document.revision.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const selectedIndex = props.documents.findIndex((document) => document.id === selectedId);
  const selected = selectedIndex >= 0 ? props.documents[selectedIndex] : null;
  return <div className="stack">
    <label htmlFor="linked-document-search"><T value={ui.editor.documents.documentpicker.searchDocuments} /></label>
    <input id="linked-document-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
    <label htmlFor="linked-document-select"><T value={ui.editor.documents.documentpicker.selectADocument} /></label>
    <select id="linked-document-select" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
      <option value=""><T value={ui.editor.documents.documentpicker.chooseADocument} /></option>
      {visible.map((document) => <option key={document.id} value={document.id}>{document.revision.title}</option>)}
    </select>
    {selected ? <form onSubmit={async (event) => {
      event.preventDefault();
      if (attaching) return;
      const data = new FormData(event.currentTarget);
      setAttaching(true);
      try { window.location.assign(await attachDocumentAction(data)); }
      finally { setAttaching(false); }
    }} className="form-row">
      <input type="hidden" name="targetType" value={props.targetType} /><input type="hidden" name="targetId" value={props.targetId} />
      <input type="hidden" name="scopeRevisionId" value={props.scopeRevisionId ?? ''} />
      <input type="hidden" name="documentId" value={selected.id} /><input type="hidden" name="returnTo" value={props.returnTo} />
      <label htmlFor="linked-document-revision"><T value={ui.editor.documents.documentpicker.revisionToCite} /></label>
      <select id="linked-document-revision" name="revisionId" defaultValue={selected.revision.id} key={selected.id}>
        {(props.revisions[selectedIndex] ?? []).map((revision) => <option key={revision.id} value={revision.id}><T value={ui.editor.documents.documentpicker.revision} />{" "}{revision.revision}{revision.id === selected.revision.id ? <T value={ui.editor.documents.documentlinks.current} /> : null}</option>)}
      </select>
      <button type="submit" disabled={attaching}><T value={ui.editor.documents.documentpicker.attach} /></button>
    </form> : null}
  </div>;
}
