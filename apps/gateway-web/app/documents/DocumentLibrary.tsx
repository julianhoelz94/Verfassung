'use client';

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { FilePlus, FileUp, PanelLeft, PanelBottom } from 'lucide-react';
import type { DocumentFolder, DocumentLibraryPage, DocumentRecord, DocumentTag, LibraryDocumentQuery } from '../../lib/document-api';
import { documentLibraryUi as m } from '../../lib/document-library-messages';
import { useTranslation } from '../components/TranslationProvider';
import { Alert, Button, Input, PageHeader, Select } from '../components/ui';
import { Inline, Stack } from '../components/layout/Layout';
import { FullWidthPage, PageChromeSurface, PageMenuBar, PageMenuFrame } from '../components/layout/PageChrome';
import { usePageChromeMetrics } from '../components/layout/usePageChromeMetrics';
import chrome from '../components/layout/PageChrome.module.css';
import { DocumentExport } from './DocumentExport';
import { DocumentDetailsDrawer } from './DocumentDetailsDrawer';
import { DocumentInspector } from './DocumentInspector';
import { BibtexImport, libraryCommand } from './BibtexImport';
import styles from './DocumentLibrary.module.css';

type Props = {
  initialPage: DocumentLibraryPage; initialFolders: DocumentFolder[]; initialTags: DocumentTag[];
  initialQuery: LibraryDocumentQuery; initialDocument: DocumentRecord | null;
  initialNew?: boolean; writable: boolean; initialError?: boolean; returnTo?: string;
};
type MembershipChange = { documentId: string; tagId: string; add: boolean };
type OrganizationAction = { command: 'folder-create' | 'folder-rename' | 'folder-delete'; id?: string; name: string };

function queryString(query: LibraryDocumentQuery) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== '') params.set(key, String(value));
  return params;
}
function authors(document: DocumentRecord) {
  return (document.revision.bibliography?.authors ?? []).map(author => author.literal || [author.family, author.given].filter(Boolean).join(', ')).join('; ');
}

export function DocumentLibrary({ initialPage, initialFolders, initialTags, initialQuery, initialDocument, initialNew, writable, initialError, returnTo }: Props) {
  const t = useTranslation();
  const router = useRouter();
  const [page, setPage] = useState(initialPage);
  const [folders, setFolders] = useState(initialFolders);
  const [tags, setTags] = useState(initialTags);
  const [query, setQuery] = useState(initialQuery);
  const [search, setSearch] = useState(initialQuery.q ?? '');
  const [document, setDocument] = useState(initialDocument);
  const [creating, setCreating] = useState(Boolean(initialNew && writable));
  const [selected, setSelected] = useState<string[]>([]);
  const [foldersShown, setFoldersShown] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(Boolean(initialDocument || (initialNew && writable)));
  const [drawerHeight, setDrawerHeight] = useState(45);
  const [selectionPending, setSelectionPending] = useState(false);
  const surface = useRef<HTMLDivElement>(null), toolbar = useRef<HTMLDivElement>(null), navigation = useRef<HTMLElement>(null);
  const folderNavigationId = useId(), drawerId = useId();
  usePageChromeMetrics(surface, toolbar, navigation);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError ? t(m.unavailable) : '');
  const [notice, setNotice] = useState('');
  const [undoChanges, setUndoChanges] = useState<MembershipChange[]>([]);
  const [targetFolder, setTargetFolder] = useState('');
  const [organizationAction, setOrganizationAction] = useState<OrganizationAction | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const unsavedId = useId();
  const requestSequence = useRef(0);
  const selectionSequence = useRef(0);
  const displayedGeneration = useRef(0);
  const refreshSequence = useRef(0);
  const queryRef = useRef(initialQuery);
  const renderedSelection = displayedGeneration.current;
  const renderedQuery = requestSequence.current;
  const activeFolder = folders.find(folder => folder.id === query.folderId);

  function guardNavigation(action: () => void) {
    if (dirty) setPendingNavigation(() => action);
    else action();
  }
  useEffect(() => {
    if (!dirty) return;
    function guardLink(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest('a') : null;
      if (!(anchor instanceof HTMLAnchorElement) || (anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, window.location.href);
      if (!['http:', 'https:'].includes(url.protocol) || (url.pathname === window.location.pathname && url.search === window.location.search && url.hash)) return;
      // External navigation uses the inspector's native unload protection once.
      if (url.origin !== window.location.origin) return;
      if (url.pathname === '/documents/command' && ['file', 'export'].includes(url.searchParams.get('action') ?? '')) return;
      event.preventDefault(); event.stopPropagation();
      setPendingNavigation(() => () => router.push(`${url.pathname}${url.search}${url.hash}`));
    }
    window.document.addEventListener('click', guardLink, true);
    return () => window.document.removeEventListener('click', guardLink, true);
  }, [dirty, router]);

  const updateUrl = useCallback((nextQuery: LibraryDocumentQuery, documentId?: string, newDocument = false) => {
    const params = queryString(nextQuery);
    if (documentId) params.set('documentId', documentId);
    if (newDocument) params.set('new', '1');
    if (returnTo) params.set('returnTo', returnTo);
    window.history.replaceState(null, '', `/documents${params.size ? `?${params}` : ''}`);
  }, [returnTo]);

  async function refreshOrganization() {
    const response = await fetch('/documents/command?action=organization', { cache: 'no-store' });
    if (!response.ok) throw new Error('document');
    const organization = await response.json() as { folders: DocumentFolder[]; tags: DocumentTag[] };
    setFolders(organization.folders); setTags(organization.tags);
  }
  async function load(nextQuery: LibraryDocumentQuery, keepSelection = false) {
    const sequence = ++requestSequence.current;
    const refresh = ++refreshSequence.current;
    queryRef.current = nextQuery;
    setQuery(nextQuery); setBusy(true); setError('');
    if (!keepSelection) setSelected([]);
    const currentSelection = new URLSearchParams(window.location.search);
    updateUrl(nextQuery, currentSelection.get('documentId') ?? undefined, currentSelection.get('new') === '1');
    try {
      const response = await fetch(`/documents/command?action=list&${queryString(nextQuery)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('document');
      const result = await response.json() as DocumentLibraryPage;
      if (sequence === requestSequence.current && refresh === refreshSequence.current) setPage(result);
    } catch { if (sequence === requestSequence.current && refresh === refreshSequence.current) { setError(t(m.unavailable)); setPage({ items: [], total: 0, offset: nextQuery.offset ?? 0, limit: nextQuery.limit ?? 30 }); } }
    finally { if (sequence === requestSequence.current) setBusy(false); }
  }
  async function refreshList() {
    const sequence = requestSequence.current;
    const refresh = ++refreshSequence.current;
    const currentQuery = queryRef.current;
    try {
      const response = await fetch(`/documents/command?action=list&${queryString(currentQuery)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('document');
      const result = await response.json() as DocumentLibraryPage;
      if (sequence === requestSequence.current && refresh === refreshSequence.current) setPage(result);
    } catch { if (sequence === requestSequence.current && refresh === refreshSequence.current) setError(t(m.unavailable)); }
  }
  async function openDocument(id: string) {
    const sequence = ++selectionSequence.current;
    setCreating(false); setDrawerOpen(true); setSelectionPending(true); setError('');
    updateUrl(query, id);
    try {
      const response = await fetch(`/documents/command?action=document&documentId=${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('document');
      const next = await response.json() as DocumentRecord;
      if (sequence === selectionSequence.current) { displayedGeneration.current = sequence; setDocument(next); }
    } catch { if (sequence === selectionSequence.current) {
      displayedGeneration.current = sequence;
      setDocument(current => current ? { ...current } : null); setCreating(creating);
      updateUrl(queryRef.current, document?.id, creating); setError(t(m.unavailable));
    } } finally { if (sequence === selectionSequence.current) setSelectionPending(false); }
  }
  async function changed(next: DocumentRecord, originSelection: number) {
    const stillSelected = () => originSelection === selectionSequence.current;
    const wasCreating = creating;
    if (stillSelected()) { setDocument(next); setCreating(false); updateUrl(queryRef.current, next.id); }
    let organizationError = '';
    if (wasCreating && activeFolder) {
      try {
        const result = await libraryCommand<{ document: DocumentRecord }>({ command: 'tag-add', documentId: next.id, tagId: activeFolder.tagId });
        next = result.document;
        if (stillSelected()) setDocument(current => current?.id === next.id && current.currentRevision > next.currentRevision ? { ...current, tags: next.tags } : next);
      } catch { organizationError = t(m.createdUnfiled); }
    }
    await refreshList();
    if (stillSelected()) updateUrl(queryRef.current, next.id);
    try { await refreshOrganization(); } catch { setError(t(m.unavailable)); }
    if (organizationError) setError(organizationError);
  }
  function newDocument() {
    displayedGeneration.current = ++selectionSequence.current; setDocument(null); setCreating(true); setDrawerOpen(true); setSelectionPending(false);
    setShowImport(false); updateUrl(query, undefined, true);
  }
  async function organize(ids: string[], tagId: string, add: boolean, undoing = false) {
    if (!ids.length || !writable || busy) return;
    setBusy(true); setError(''); setNotice('');
    const changes: MembershipChange[] = [];
    const originSelection = displayedGeneration.current;
    const completed = new Set<string>();
    let actionError = '';
    try {
      for (const id of ids) {
        const current = page.items.find(item => item.id === id) ?? (document?.id === id ? document : undefined);
        if (current && Boolean(current.tags?.some(tag => tag.id === tagId)) === add) { completed.add(id); continue; }
        const result = await libraryCommand<{ document: DocumentRecord }>({ command: add ? 'tag-add' : 'tag-remove', documentId: id, tagId });
        if (originSelection === selectionSequence.current) setDocument(current => current?.id !== result.document.id ? current : current.currentRevision > result.document.currentRevision ? { ...current, tags: result.document.tags } : result.document);
        changes.push({ documentId: id, tagId, add: !add });
        completed.add(id);
      }
      setNotice(t(m.organized));
    } catch { actionError = changes.length ? t(m.partial) : t(m.actionError); }
    finally {
      setUndoChanges(undoing ? ids.filter(id => !completed.has(id)).map(documentId => ({ documentId, tagId, add })) : changes);
      setBusy(false);
      setSelected(current => current.filter(id => !completed.has(id)));
      await refreshList();
      if (actionError) setError(actionError);
    }
  }
  async function undo() {
    if (!undoChanges.length) return;
    const pending = [...undoChanges];
    setUndoChanges([]);
    // A folder operation records one tag and direction; successful items remain undoable after a partial retry.
    await organize(pending.map(change => change.documentId), pending[0].tagId, pending[0].add, true);
  }
  async function saveOrganization(event: FormEvent) {
    event.preventDefault(); if (!organizationAction) return;
    setBusy(true); setError('');
    try {
      await libraryCommand({ ...organizationAction, folderId: organizationAction.id, tagId: organizationAction.id });
      await refreshOrganization();
      if (organizationAction.command === 'folder-delete' && organizationAction.id === queryRef.current.folderId) await load({ ...queryRef.current, folderId: undefined, offset: 0 });
      else await refreshList();
      setOrganizationAction(null);
    } catch { setError(t(m.actionError)); }
    finally { setBusy(false); }
  }
  function navigate(next: LibraryDocumentQuery) { setShowImport(false); void load({ ...next, offset: 0 }); }

  function renderToolbar() {
    return <PageMenuFrame ref={toolbar}><PageMenuBar as="nav" label={t(m.toolbar)}>
      <button type="button" className={chrome.tool} aria-controls={folderNavigationId} aria-expanded={foldersShown}
        aria-label={t(foldersShown ? m.hideFolders : m.showFolders)} title={t(foldersShown ? m.hideFolders : m.showFolders)} onClick={() => setFoldersShown(value => !value)}><PanelLeft aria-hidden="true" /><span>{t(m.folders)}</span></button>
      <span className={styles.toolbarDivider} aria-hidden="true" />
      {writable ? <><button type="button" className={chrome.tool} onClick={() => guardNavigation(newDocument)}><FilePlus aria-hidden="true" /><span>{t(m.newDocument)}</span></button>
        <button type="button" className={chrome.tool} aria-expanded={showImport} aria-controls="library-bibtex-import" onClick={() => setShowImport(value => !value)}><FileUp aria-hidden="true" /><span>{t(m.import)}</span></button></> : null}
      <DocumentExport label={activeFolder ? t(m.exportFolder) : t(m.export)} folderId={query.folderId} />
      <button type="button" className={chrome.tool} disabled={!document && !creating} aria-expanded={drawerOpen} aria-controls={drawerId}
        aria-label={t(drawerOpen ? m.hideDocumentDetails : m.showDocumentDetails)} title={t(drawerOpen ? m.hideDocumentDetails : m.showDocumentDetails)} onClick={() => setDrawerOpen(value => !value)}><PanelBottom aria-hidden="true" /><span>{t(m.showDetails)}</span></button>
    </PageMenuBar></PageMenuFrame>;
  }

  function renderNavigation() {
    return <aside id={folderNavigationId} ref={navigation} className={styles.navigation} hidden={!foldersShown} aria-label={t(m.folders)}>
        <Stack gap="card">
          <nav aria-label={t(m.title)} className={styles.folderLinks}>
            <button type="button" aria-current={!query.folderId && !query.tagId && query.status !== 'archived' ? 'page' : undefined} onClick={() => navigate({ ...query, folderId: undefined, tagId: undefined, status: 'active' })}>{t(m.all)}</button>
            <button type="button" aria-current={query.status === 'archived' ? 'page' : undefined} onClick={() => navigate({ ...query, folderId: undefined, tagId: undefined, status: 'archived' })}>{t(m.archived)}</button>
          </nav>
          <section><h2 className={styles.sectionLabel}>{t(m.folders)}</h2>
            {writable ? <p className={styles.muted}>{t(m.folderDrop)}</p> : null}
            <ul className={styles.folderList}>{folders.map(folder => <li key={folder.id} onDragOver={event => { if (writable && !busy && event.dataTransfer.types.includes('application/x-document-ids')) event.preventDefault(); }} onDrop={event => {
              event.preventDefault(); if (!writable || busy) return;
              try { const ids: unknown = JSON.parse(event.dataTransfer.getData('application/x-document-ids')); if (Array.isArray(ids) && ids.length <= 100 && ids.every(id => typeof id === 'string')) void organize(ids, folder.tagId, true); } catch { setError(t(m.actionError)); }
            }}>
              <button type="button" className={styles.folderButton} aria-current={query.folderId === folder.id ? 'page' : undefined} onClick={() => navigate({ ...query, folderId: folder.id, tagId: undefined, status: 'active' })}>{folder.name}</button>
              {writable ? <details className={styles.folderActions}><summary aria-label={`${folder.name}: ${t(m.rename)}`}>···</summary><Button type="button" variant="ghost" onClick={() => setOrganizationAction({ command: 'folder-rename', id: folder.id, name: folder.name })}>{t(m.rename)}</Button><Button type="button" variant="ghost" onClick={() => setOrganizationAction({ command: 'folder-delete', id: folder.id, name: folder.name })}>{t(m.deleteFolder)}</Button></details> : null}
            </li>)}</ul>
            {!folders.length ? <p className={styles.muted}>{t(m.noFolder)}</p> : null}
            {writable ? <Button type="button" variant="ghost" onClick={() => setOrganizationAction({ command: 'folder-create', name: '' })}>{t(m.newFolder)}</Button> : null}
          </section>
          {organizationAction ? <Stack as="form" gap="field" onSubmit={saveOrganization} className={styles.organizationForm}>
            {organizationAction.command === 'folder-delete' ? <><strong>{organizationAction.name}</strong><p>{t(m.folderDeleteHelp)}</p></> : <Input label={t(m.folderName)} value={organizationAction.name} onChange={event => setOrganizationAction({ ...organizationAction, name: event.target.value })} required maxLength={128} autoFocus />}
            <Inline><Button variant="primary" disabled={busy}>{t(organizationAction.command === 'folder-delete' ? m.confirmDelete : m.save)}</Button><Button type="button" onClick={() => setOrganizationAction(null)} disabled={busy}>{t(m.cancel)}</Button></Inline>
          </Stack> : null}
        </Stack>
      </aside>;
  }

  function renderResults() {
    return <section className={styles.results} aria-label={t(m.showList)}>
        <Stack gap="field">
          <form className={styles.searchControls} onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void load({ ...query, q: search, offset: 0 }); }}>
            <Input label={t(m.search)} placeholder={t(m.searchHelp)} value={search} onChange={event => setSearch(event.target.value)} />
            <Select label={t(m.sort)} value={query.sort ?? 'created'} onChange={event => void load({ ...query, sort: event.target.value as LibraryDocumentQuery['sort'], offset: 0 })} disabled={busy}>
              <option value="created">{t(m.sortCreated)}</option><option value="title">{t(m.sortTitle)}</option><option value="key">{t(m.sortKey)}</option><option value="year">{t(m.sortYear)}</option>
            </Select>
            <Button disabled={busy}>{t(m.submitSearch)}</Button>
          </form>
          <Inline><h2 className={styles.resultsTitle}>{activeFolder?.name ?? tags.find(tag => tag.id === query.tagId)?.name ?? t(query.status === 'archived' ? m.archived : m.all)}</h2><span className={styles.muted}>{page.total} {t(m.results)}</span></Inline>
          <Inline><label className={styles.checkLabel}><input type="checkbox" checked={page.items.length > 0 && page.items.every(item => selected.includes(item.id))} onChange={event => setSelected(event.target.checked ? page.items.map(item => item.id) : [])} />{t(m.selectPage)}</label>{selected.length ? <><span>{selected.length} {t(m.selected)}</span><Button type="button" variant="ghost" onClick={() => setSelected([])}>{t(m.clearSelection)}</Button></> : null}</Inline>
          {selected.length ? <Stack gap="control" className={styles.bulkActions}>
            <DocumentExport label={t(m.exportSelected)} folderId={query.folderId} documentIds={selected} />
            {writable ? <><Inline align="end"><Select label={t(m.addToFolder)} value={targetFolder} onChange={event => setTargetFolder(event.target.value)} disabled={busy}><option value="">{t(m.chooseFolder)}</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</Select><Button type="button" onClick={() => { const folder = folders.find(item => item.id === targetFolder); if (folder) void organize(selected, folder.tagId, true); }} disabled={busy || !targetFolder}>{t(m.addToFolder)}</Button></Inline>{activeFolder ? <Button type="button" onClick={() => void organize(selected, activeFolder.tagId, false)} disabled={busy}>{t(m.removeFromFolder)}</Button> : null}</> : null}
          </Stack> : null}
          <ul className={styles.documentList}>{page.items.map(item => <li key={item.id} className={document?.id === item.id ? styles.selectedDocument : undefined} draggable={writable && !busy} onDragStart={event => {
            event.dataTransfer.setData('application/x-document-ids', JSON.stringify(selected.includes(item.id) ? selected : [item.id])); event.dataTransfer.effectAllowed = 'copy';
          }}>
            <label className={styles.documentCheckbox}><input type="checkbox" aria-label={`${t(m.select)}: ${item.revision.title}`} checked={selected.includes(item.id)} onChange={event => setSelected(current => event.target.checked ? [...current, item.id] : current.filter(id => id !== item.id))} /></label>
            <div className={styles.documentContent}><button type="button" className={styles.documentTitle} aria-haspopup="dialog" aria-expanded={document?.id === item.id && drawerOpen} aria-controls={drawerId} disabled={selectionPending} onClick={() => { if (document?.id === item.id && !creating) setDrawerOpen(value => !value); else guardNavigation(() => void openDocument(item.id)); }}>{item.revision.title}</button>
              <p className={styles.muted}>{[authors(item), item.revision.bibliography?.issued].filter(Boolean).join(' · ')}</p>
              <Inline gap="related"><code>{item.citationKey ?? item.revision.citationKey ?? ''}</code>{item.citationKey ? <Button type="button" variant="ghost" aria-label={`${t(m.copyKey)}: ${item.citationKey}`} onClick={async () => {
                try { await navigator.clipboard.writeText(item.citationKey!); setNotice(t(m.copied)); } catch { setNotice(t(m.copyFailed)); }
              }}>⧉</Button> : null}</Inline>
              <div className={styles.tags}>{(item.tags ?? []).filter(tag => !folders.some(folder => folder.tagId === tag.id)).map(tag => <span key={tag.id} className="badge">{tag.name}</span>)}</div>
            </div>
          </li>)}</ul>
          {!page.items.length ? <div className={styles.empty}><h3>{t(m.empty)}</h3><p>{t(m.emptyHelp)}</p></div> : null}
          <nav aria-label={t(m.pagination)}><Inline><Button type="button" disabled={busy || page.offset <= 0} onClick={() => void load({ ...query, offset: Math.max(0, page.offset - page.limit) })}>{t(m.previous)}</Button><span>{page.total ? page.offset + 1 : 0}–{Math.min(page.offset + page.items.length, page.total)} {t(m.of)} {page.total}</span><Button type="button" disabled={busy || page.offset + page.limit >= page.total} onClick={() => void load({ ...query, offset: page.offset + page.limit })}>{t(m.next)}</Button></Inline></nav>
        </Stack>
      </section>;
  }

  return <FullWidthPage template="collection"><PageChromeSurface ref={surface} style={{ '--document-drawer-height': `${drawerHeight}dvh` } as CSSProperties}>
    {renderToolbar()}
    <Stack gap="section" className={styles.body} data-drawer-open={drawerOpen && Boolean(document || creating)}>
      <PageHeader title={t(m.title)} meta={t(m.subtitle)} />
    {!writable ? <Alert>{t(m.readOnly)}</Alert> : null}
    {error ? <Alert tone="error">{error}</Alert> : null}
    {notice || undoChanges.length ? <Inline>{notice ? <span role="status">{notice}</span> : null}{undoChanges.length ? <Button type="button" onClick={undo} disabled={busy}>{t(m.undo)}</Button> : null}</Inline> : null}
    {pendingNavigation ? <section className={styles.navigationGuard} role="alertdialog" aria-labelledby={`${unsavedId}-title`} aria-describedby={`${unsavedId}-help`}>
      <Stack gap="field"><h2 id={`${unsavedId}-title`}>{t(m.unsavedTitle)}</h2><p id={`${unsavedId}-help`}>{t(m.unsavedHelp)}</p><Inline>
        <Button type="button" variant="primary" onClick={() => setPendingNavigation(null)} autoFocus>{t(m.keepEditing)}</Button>
        <Button type="button" onClick={() => { const action = pendingNavigation; setPendingNavigation(null); setDirty(false); action(); }}>{t(m.discard)}</Button>
      </Inline></Stack>
    </section> : null}
    {returnTo ? <p><a href={returnTo}>{t(m.close)}</a></p> : null}
    <div id="library-bibtex-import" hidden={!showImport}>
    {showImport && writable ? <BibtexImport folders={folders} folderId={query.folderId} onClose={() => setShowImport(false)} onImported={async (_documents, folderId) => {
      setShowImport(false); setNotice(t(m.imported)); setSelected([]);
      if (renderedQuery === requestSequence.current) await load({ ...queryRef.current, folderId, tagId: undefined, offset: 0 });
      else await refreshList();
      await refreshOrganization().catch(() => setError(t(m.unavailable)));
    }} /> : null}</div>
    <div className={styles.library} data-navigation={foldersShown} aria-busy={busy}>
      {renderNavigation()}
      {renderResults()}
    </div>
    </Stack>
    <DocumentDetailsDrawer id={drawerId} open={drawerOpen && Boolean(document || creating)} title={document?.revision.title ?? t(m.newDocument)} height={drawerHeight} onHeightChange={setDrawerHeight} onClose={() => setDrawerOpen(false)}>
      {document || creating ? <>
      {selectionPending ? <p role="status">{t(m.loading)}</p> : null}
      <fieldset className={styles.inspectorFields} disabled={selectionPending} aria-busy={selectionPending}>
        <DocumentInspector key={creating ? 'new' : document!.id} embedded document={document} createMode={creating} writable={writable} tags={tags.filter(tag => !folders.some(folder => folder.tagId === tag.id))} folders={folders}
          onDirtyChange={setDirty} onChanged={next => void changed(next, renderedSelection)} onClose={() => setDrawerOpen(false)} />
      </fieldset></> : null}
    </DocumentDetailsDrawer>
  </PageChromeSurface></FullWidthPage>;
}
