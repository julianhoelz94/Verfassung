'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { DocumentFolder, DocumentRecord, DocumentRevision } from '../../../lib/document-api';
import { useTranslation } from '../TranslationProvider';
import { Button, Input, Select } from '../ui';
import { Inline, Stack } from '../layout/Layout';
import styles from './DocumentAttachmentTemplate.module.css';

type Props = {
  documents: DocumentRecord[]; revisions: Record<string, DocumentRevision[]>; folders: DocumentFolder[]; attachedIds: string[];
  pending: boolean; searchPending?: boolean; revisionPending?: boolean; documentTotal?: number; documentOffset?: number;
  onSearch?: (query: string, offset: number, folderId?: string) => Promise<boolean>; onSelect?: (id: string) => Promise<void>;
  onAttach: (id: string, revision: string) => Promise<boolean>; onCancel: () => void; contextFields?: ReactNode;
};

/** One combobox owns both searching and selecting; the host supplies authorized data. */
export function DocumentLibraryPicker({ documents, revisions, folders, attachedIds, pending, searchPending, revisionPending, documentTotal, documentOffset = 0, onSearch, onSelect, onAttach, onCancel, contextFields }: Props) {
  const id = useId(), t = useTranslation(), copy = (en: string, de: string) => t({ en, de });
  const [text, setText] = useState(''), [term, setTerm] = useState(''), [folderId, setFolderId] = useState('');
  const [selection, setSelection] = useState<DocumentRecord | null>(null), [revision, setRevision] = useState(''), [open, setOpen] = useState(false), [activeIndex, setActiveIndex] = useState(-1);
  const [waiting, setWaiting] = useState(false), [failed, setFailed] = useState(false);
  const list = useRef<HTMLUListElement>(null);
  const edited = useRef(false), generation = useRef(0), searchRef = useRef(onSearch), busy = useRef(false);
  useEffect(() => { searchRef.current = onSearch; }, [onSearch]);
  useEffect(() => {
    const search = searchRef.current;
    if (!edited.current || !search) return;
    let cancelled = false;
    const current = ++generation.current;
    void search(term, 0, folderId || undefined).then(ok => {
      if (!cancelled && current === generation.current) { setFailed(!ok); setWaiting(false); }
    }).catch(() => { if (!cancelled && current === generation.current) { setFailed(true); setWaiting(false); } });
    return () => { cancelled = true; };
  }, [term, folderId]);
  const folder = folders.find(folder => folder.id === folderId);
  const available = documents.filter(document => document.status === 'active' && !attachedIds.includes(document.id) && (!folder || document.tags?.some(tag => tag.id === folder.tagId)));
  const results = available.filter(document => onSearch || JSON.stringify(document).toLowerCase().includes(term.toLowerCase()));
  const loading = waiting || searchPending;
  const visibleResults = failed ? [] : results;
  const active = visibleResults.length ? Math.max(0, Math.min(activeIndex, visibleResults.length - 1)) : -1;
  useEffect(() => {
    if (open && active >= 0) list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active]);
  // A visible match can be chosen while another search is in flight. Keep its
  // immutable citation even when the replacement results no longer contain it.
  const selected = selection && !attachedIds.includes(selection.id) ? selection : null;
  const selectedId = selected?.id ?? '';
  const options = selected ? revisions[selected.id] ?? [selected.revision] : [];
  const pin = revision || selected?.revision.id || '';
  function edit(value: string) {
    edited.current = true; setText(value); setSelection(null); setRevision(''); setOpen(true); setActiveIndex(-1); setFailed(false);
    setWaiting(Boolean(onSearch && value !== term)); setTerm(value); void onSelect?.('');
  }
  function choose(document: DocumentRecord) {
    setSelection(document); setText(document.revision.title); setRevision(''); setOpen(false); setActiveIndex(-1); void onSelect?.(document.id);
  }
  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case 'ArrowDown': event.preventDefault(); setOpen(true); setActiveIndex(index => Math.min(index + 1, visibleResults.length - 1)); break;
      case 'ArrowUp': event.preventDefault(); setOpen(true); setActiveIndex(index => index <= 0 ? visibleResults.length - 1 : index - 1); break;
      case 'Home': if (open) { event.preventDefault(); setActiveIndex(0); } break;
      case 'End': if (open) { event.preventDefault(); setActiveIndex(visibleResults.length - 1); } break;
      case 'Enter': event.preventDefault(); if (open && active >= 0) choose(visibleResults[active]); break;
      case 'Escape': if (open) { event.preventDefault(); event.stopPropagation(); setOpen(false); } break;
    }
  }
  async function attach() {
    if (!selected || !pin || pending || revisionPending || busy.current) return;
    busy.current = true;
    try { if (await onAttach(selected.id, pin)) { setSelection(null); setRevision(''); setText(term); onCancel(); } }
    finally { busy.current = false; }
  }
  async function page(offset: number) {
    if (!onSearch || pending || loading) return;
    setWaiting(true); setFailed(false); setSelection(null); setRevision(''); setText(term); setOpen(true);
    const current = ++generation.current;
    try { const ok = await onSearch(term, offset, folderId || undefined); if (current === generation.current) setFailed(!ok); }
    catch { if (current === generation.current) setFailed(true); }
    finally { if (current === generation.current) setWaiting(false); }
  }
  function renderResults() {
    return <div className={styles.pickerResults} hidden={!open}>
      <ul ref={list} id={`${id}-results`} role="listbox" aria-label={copy('Matching documents', 'Passende Dokumente')} aria-busy={Boolean(loading)} className={styles.matches}>
        {visibleResults.map((document, index) => <li id={`${id}-result-${index}`} key={document.id} role="option" aria-selected={index === active}
          onMouseDown={event => event.preventDefault()} onMouseMove={() => setActiveIndex(index)} onClick={() => choose(document)}>
          <strong>{document.revision.title}</strong><span>{[document.citationKey, document.revision.bibliography?.issued].filter(Boolean).join(' · ')}</span>
        </li>)}
      </ul>
      {!loading && !failed && !visibleResults.length ? <p className={styles.muted}>{copy('No matching documents.', 'Keine passenden Dokumente.')}</p> : null}
      {onSearch && (documentTotal ?? 0) > 30 ? <Inline><Button type="button" size="sm" variant="ghost" disabled={Boolean(pending || loading || documentOffset === 0)} onClick={() => void page(Math.max(0, documentOffset - 30))}>{copy('Previous', 'Zurück')}</Button><Button type="button" size="sm" variant="ghost" disabled={Boolean(pending || loading || documentOffset + 30 >= (documentTotal ?? 0))} onClick={() => void page(documentOffset + 30)}>{copy('Next', 'Weiter')}</Button></Inline> : null}
    </div>;
  }
  return <Stack gap="control" className={styles.picker}>
    {folders.length ? <Select form={`${id}-controls`} label={copy('Project folder', 'Projektordner')} value={folderId} disabled={Boolean(pending || loading)} onChange={event => {
      const next = event.target.value; edited.current = true; setFolderId(next); setSelection(null); setRevision(''); setText(term); setOpen(true); setWaiting(Boolean(onSearch)); setFailed(false); setActiveIndex(-1); void onSelect?.('');
    }}><option value="">{copy('All documents', 'Alle Dokumente')}</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</Select> : null}
    <Input form={`${id}-controls`} label={copy('Search documents', 'Dokumente suchen')} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-results`} aria-activedescendant={open && active >= 0 ? `${id}-result-${active}` : undefined}
      autoComplete="off" maxLength={500} placeholder={copy('Title, citation key, author…', 'Titel, Zitierschlüssel, Autor…')} help={copy('Type to search. Use ↑ / ↓, then Enter to select.', 'Zum Suchen tippen. Mit ↑ / ↓ wählen und mit Enter bestätigen.')} value={text} disabled={pending}
      onChange={event => edit(event.target.value)} onFocus={() => { if (!selectedId) setOpen(true); }} onBlur={() => setOpen(false)} onKeyDown={keyDown} />
    <span className={styles.muted} role="status">{failed ? copy('Search unavailable. Try typing again.', 'Suche nicht verfügbar. Bitte erneut tippen.') : open ? `${visibleResults.length} ${copy('matching documents', 'passende Dokumente')}` : ''}</span>
    {renderResults()}
    {selected ? <div className={styles.selectedSource}><strong>{selected.revision.title}</strong><span>{selected.citationKey} · {copy('Revision', 'Revision')} {options.find(option => option.id === pin)?.revision ?? selected.revision.revision}</span></div> : null}
    {selected ? <details className={styles.details}><summary>{copy('Citation options', 'Zitieroptionen')}</summary><Select form={`${id}-controls`} label={copy('Revision to cite', 'Zu zitierende Revision')} value={pin} disabled={Boolean(pending || revisionPending)} onChange={event => setRevision(event.target.value)}>{options.map(item => <option key={item.id} value={item.id}>{copy('Revision', 'Revision')} {item.revision}</option>)}</Select></details> : null}
    {revisionPending ? <p role="status" className={styles.muted}>{copy('Loading revisions…', 'Revisionen werden geladen…')}</p> : null}
    {contextFields}
    <Inline><Button type="button" variant="primary" disabled={Boolean(pending || revisionPending || !selected || !pin)} onClick={() => void attach()}>{copy('Attach document', 'Dokument verknüpfen')}</Button><Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>{copy('Cancel', 'Abbrechen')}</Button></Inline>
  </Stack>;
}
