import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DocumentAttachmentTemplate } from '../../../../apps/gateway-web/app/components/documents/DocumentAttachmentTemplate';
import { TranslationProvider, useTranslation } from '../../../../apps/gateway-web/app/components/TranslationProvider';
import type { DocumentRecord, DocumentRevision, DocumentLink } from '../../../../apps/gateway-web/lib/document-api';
import '../../../../apps/gateway-web/app/styles/tokens.css';
import '../../../../apps/gateway-web/app/globals.css';
import './preview.css';

const folders = [{ id: 'germany', name: 'Germany project', tagId: 'germany' }, { id: 'comparative', name: 'Comparative research', tagId: 'comparative' }];
function source(id: string, title: string, citationKey: string, year: string, author: string, folder: string): DocumentRecord {
  return { id, citationKey, currentRevision: 2, status: 'active', createdAt: '2026-01-01', tags: folder ? [{ id: folder, name: folders.find(item => item.id === folder)!.name }] : [], revision: {
    id: `${id}-r2`, documentId: id, revision: 2, title, citationKey, fileName: `${citationKey}.pdf`, contentType: 'application/pdf', sourceUrl: 'https://example.org/source', description: 'Sample source for this interactive preview.', createdAt: '2026-01-01', createdBy: 'preview',
    bibliography: { type: 'book', authors: [{ literal: author }], editors: [], issued: year, publisher: 'Sample publisher', extra: {} }, attachments: [],
  } };
}
const initial = [
  source('basic-law', 'Basic Law for the Federal Republic of Germany', 'GG1949', '1949', 'Parliamentary Council', 'germany'),
  source('federalism', 'Federalism and constitutions', 'Mueller2024', '2024', 'Anna Müller', 'germany'),
  source('gazette', 'Federal Law Gazette · Commencement notice', 'Gazette1949', '1949', 'Federal Law Gazette', 'germany'),
  source('comparative', 'Comparative constitutional law', 'Comparative2023', '2023', 'Elena Rossi', 'comparative'),
  source('amendment', 'Constitutional amendment · Explanatory memorandum', 'Memorandum2025', '2025', 'Parliamentary Research Service', 'comparative'),
  source('archive', 'Archival notes on constitutional history', 'Archive2022', '2022', 'National Archives', ''),
];
function pin(document: DocumentRecord): DocumentLink { return { documentId: document.id, revisionId: document.revision.id, document }; }
const tick = () => new Promise(resolve => setTimeout(resolve, 180));

function Host({ kind, documents, onCreated, onInspect }: { kind: string; documents: DocumentRecord[]; onCreated: (document: DocumentRecord) => void; onInspect: (document: DocumentRecord) => void }) {
  const t = useTranslation(), copy = (en: string, de: string) => t({ en, de });
  const [contextNote, setContextNote] = useState(''), [contextScope, setContextScope] = useState('record');
  const [notes, setNotes] = useState<Record<string, { body: string; scope: string }>>({});
  const [links, setLinks] = useState<DocumentLink[]>(kind === 'constitution' ? [pin(initial[0])] : []);
  const [page, setPage] = useState(documents), [revisions, setRevisions] = useState<Record<string, DocumentRevision[]>>({});
  const searchRequest = useRef(0);
  const [total, setTotal] = useState(documents.length), [offset, setOffset] = useState(0), [pending, setPending] = useState(false), [searching, setSearching] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const hostTitle = { constitution: copy('Constitution settings', 'Verfassungseinstellungen'), amendment: copy('Amendment evidence', 'Quellen der Rechtsänderung'), lifecycle: copy('Record a lifecycle event', 'Lebenszyklusereignis erfassen'), version: copy('Sources for text version · 1949', 'Quellen der Textversion · 1949') }[kind];
  async function search(q: string, start: number, folder?: string) {
    const request = ++searchRequest.current;
    setSearching(true); await tick();
    if (request !== searchRequest.current) return false;
    const matches = documents.filter(document => JSON.stringify(document).toLowerCase().includes(q.toLowerCase()) && (!folder || document.tags?.some(tag => tag.id === folder)));
    setPage(matches.slice(start, start + 30)); setTotal(matches.length); setOffset(start); setSearching(false); return true;
  }
  async function create(data: FormData) {
    const key = String(data.get('citationKey') || `Source${documents.length + 1}`);
    if (documents.some(document => document.citationKey?.toLowerCase() === key.toLowerCase())) { setError(copy('That citation key is already used. Choose another; your entries are preserved.', 'Dieser Zitierschlüssel wird bereits verwendet. Wähle einen anderen; deine Eingaben bleiben erhalten.')); return false; }
    setPending(true); setError(''); await tick();
    const id = `new-${documents.length}`, file = data.get('file');
    const record = source(id, String(data.get('title')), key, '', '', '');
    record.currentRevision = 1; record.revision.revision = 1; record.revision.id = `${id}-r1`;
    record.revision.fileName = file instanceof File ? file.name : null;
    record.revision.sourceUrl = String(data.get('sourceUrl')); record.revision.description = String(data.get('description'));
    record.revision.bibliography = JSON.parse(String(data.get('bibliography')));
    setNotes(current => ({ ...current, [record.id]: { body: contextNote, scope: contextScope } })); setContextNote('');
    onCreated(record); setTotal(total => total + 1); setPage(current => [record, ...current]); setLinks(current => [...current, pin(record)]); setNotice(copy('Document attached. Preview only; nothing was uploaded.', 'Dokument verknüpft. Nur Vorschau; es wurde nichts hochgeladen.')); setPending(false); return true;
  }
  async function attach(id: string, revisionId: string) {
    const document = documents.find(document => document.id === id)!;
    const revision = revisions[id]?.find(revision => revision.id === revisionId) ?? document.revision;
    setNotes(current => ({ ...current, [id]: { body: contextNote, scope: contextScope } })); setContextNote('');
    setLinks(current => [...current, { documentId: id, revisionId, document: { ...document, revision } }]); setNotice(copy('Document attached to this example.', 'Dokument mit diesem Beispiel verknüpft.')); return true;
  }
  return <form className="host" onSubmit={event => { event.preventDefault(); setNotice(copy(`Example saved with ${links.length} attached document(s).`, `Beispiel mit ${links.length} verknüpften Dokumenten gespeichert.`)); }}>
    <div className="host-heading"><span className="eyebrow">{copy('IN YOUR WORKSPACE', 'IM ARBEITSBEREICH')}</span><h2>{hostTitle}</h2></div>
    <div className="host-fields">
      <label>{copy('Working note', 'Arbeitsnotiz')}<textarea aria-label={copy('Working note', 'Arbeitsnotiz')} rows={2} defaultValue={copy('Keep this unsaved note while choosing or uploading a source.', 'Diese ungespeicherte Notiz bleibt beim Auswählen oder Hochladen einer Quelle erhalten.')} /></label>
      {kind === 'amendment' ? <label>{copy('Commentary context', 'Kommentarkontext')}<select value={contextScope} onChange={event => setContextScope(event.target.value)}><option value="record">{copy('Whole amendment', 'Gesamte Rechtsänderung')}</option><option value="change-28">{copy('Highlighted change · Article 28', 'Markierte Änderung · Artikel 28')}</option></select></label> : null}
      {kind === 'lifecycle' ? <label>{copy('Effective date', 'Wirksamkeitsdatum')}<input type="date" defaultValue="1949-05-24" /></label> : null}
    </div>
    <DocumentAttachmentTemplate links={links} documents={page} revisions={revisions} folders={folders} canEdit pending={pending} searchPending={searching} documentTotal={total} documentOffset={offset} error={error} notice={notice}
      contextFields={mode => <details className="attachment-note"><summary>{copy('Citation note / relevant passage', 'Zitiernotiz / relevante Stelle')}</summary><label>{copy('Note for this attachment', 'Notiz zu dieser Verknüpfung')}<textarea form={`preview-${kind}-${mode}-note`} rows={2} value={contextNote} placeholder={copy('For example: Chapter 3, pp. 42–45 explains this amendment.', 'Zum Beispiel: Kapitel 3, S. 42–45 erläutert diese Rechtsänderung.')} onChange={event => setContextNote(event.target.value)} /></label><p>{copy('Belongs to this record or highlighted change, not to the shared document.', 'Gehört zu diesem Datensatz oder der markierten Änderung, nicht zum gemeinsamen Dokument.')}</p></details>}
      renderAttachmentContext={link => notes[link.documentId]?.body ? <p className="attached-note">{notes[link.documentId].scope === 'record' ? '' : 'Article 28 · '}{notes[link.documentId].body}</p> : null}
      onSearch={search} onSelect={async id => { const document = documents.find(document => document.id === id); if (document) setRevisions(current => ({ ...current, [id]: [document.revision, { ...document.revision, id: `${id}-r1`, revision: 1 }] })); }} onCreate={create} onAttach={attach}
      onDetach={async id => { setLinks(current => current.filter(link => link.documentId !== id)); setNotice(copy('Detached. The document remains in the library.', 'Verknüpfung gelöst. Das Dokument bleibt in der Bibliothek.')); return true; }} onInspect={onInspect} />
    <div className="host-footer"><span>{copy('Your working note stays here while you attach evidence.', 'Deine Arbeitsnotiz bleibt beim Verknüpfen erhalten.')}</span><button className="btn btn-primary" type="submit">{copy('Save example', 'Beispiel speichern')}</button></div>
  </form>;
}

function Preview() {
  const [locale, setLocale] = useState<'en' | 'de'>('en'), [kind, setKind] = useState('constitution'), [documents, setDocuments] = useState(initial);
  const [inspected, setInspected] = useState<DocumentRecord | null>(null);
  const copy = (en: string, de: string) => locale === 'en' ? en : de;
  return <TranslationProvider locale={locale}>
    <header className="preview-header"><span className="brand">▧ Constitution Atlas</span><span className="preview-note">{copy('Interactive preview · Sample data · No uploads', 'Interaktive Vorschau · Beispieldaten · Keine Uploads')}</span><label className="language">{copy('Language', 'Sprache')}<select aria-label={copy('Preview language', 'Vorschausprache')} value={locale} onChange={event => { const value = event.target.value as 'en' | 'de'; setLocale(value); document.documentElement.lang = value; }}><option value="en">English</option><option value="de">Deutsch</option></select></label></header>
    <main><div className="intro"><span className="eyebrow">{copy('REUSABLE DOCUMENT CONTROLS', 'WIEDERVERWENDBARE DOKUMENTFUNKTIONEN')}</span><h1>{copy('Attach a document', 'Ein Dokument verknüpfen')}</h1><p>{copy('Browse your library or add a source. Optional information stays out of the way until you need it.', 'Bibliothek durchsuchen oder eine Quelle hinzufügen. Optionale Angaben erscheinen erst, wenn du sie benötigst.')}</p></div>
      <nav className="contexts" aria-label={copy('Example context', 'Beispielkontext')}>{[['constitution', 'Constitution', 'Verfassung'], ['version', 'Text version', 'Textversion'], ['amendment', 'Amendment', 'Rechtsänderung'], ['lifecycle', 'Lifecycle event', 'Lebenszyklusereignis']].map(([value, en, de]) => <button type="button" key={value} aria-pressed={kind === value} onClick={() => setKind(value)}>{copy(en, de)}</button>)}</nav>
      {['constitution', 'version', 'amendment', 'lifecycle'].map(value => <section key={value} hidden={kind !== value}><Host kind={value} documents={documents} onCreated={document => setDocuments(current => [...current, document])} onInspect={setInspected} /></section>)}
      <p className="try">{copy('Try: filter a folder, cite an older revision, upload a file, or expand Optional details. You can switch contexts without losing your draft.', 'Ausprobieren: nach Ordner filtern, eine ältere Revision zitieren, eine Datei auswählen oder Optionale Angaben öffnen. Ein Kontextwechsel behält deine Entwürfe.')}</p>
    </main>
    {inspected ? <dialog className="document-dialog" aria-labelledby="document-title" ref={element => { if (element && !element.open) element.showModal(); }} onCancel={() => setInspected(null)}><div className="dialog-heading"><h2 id="document-title">{inspected.revision.title}</h2><button type="button" className="btn" onClick={() => setInspected(null)} autoFocus>{copy('Close', 'Schließen')}</button></div>
      <article><p>{inspected.citationKey} · {inspected.revision.bibliography?.issued} · {copy('Revision', 'Revision')} {inspected.revision.revision}</p><p>{inspected.revision.bibliography?.authors.map(author => author.literal || author.family).join('; ')}</p><p>{inspected.revision.fileName || copy('Source URL only', 'Nur Quell-URL')}</p></article>
    </dialog> : null}
  </TranslationProvider>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
