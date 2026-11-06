'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import type { DocumentAttachment, DocumentBibliography, DocumentCreator, DocumentFolder, DocumentLinkEvent, DocumentRecord, DocumentRevision, DocumentTag } from '../../lib/document-api';
import { libraryCommand } from './BibtexImport';
import { useLocale } from '../components/TranslationProvider';
import { Alert, Badge, Button, Input, Select, TextArea } from '../components/ui';
import { Grid, Inline, Stack } from '../components/layout/Layout';
import styles from './DocumentInspector.module.css';

const labels = {
  en: {
    empty: 'Select a document to inspect its bibliography, files, and history.', new: 'New document', close: 'Back to documents', bibliography: 'Bibliography', files: 'Files', tags: 'Tags', usage: 'Usage', history: 'History',
    title: 'Title', key: 'Citation key', keyHelp: 'Start with a letter. Use letters, numbers, underscores, colons, or hyphens. Leave empty to generate a key.', suggest: 'Suggest key', copy: 'Copy key', copied: 'Citation key copied.', unavailable: 'Could not check availability. The key will be checked when you save.', checking: 'Checking key…', available: 'Key available.', taken: 'This key is already reserved. Choose another key.', invalid: 'Use 1–128 characters, starting with a letter.',
    type: 'Item type', authors: 'Authors', editors: 'Editors', person: 'Person', institution: 'Institution', family: 'Family name', given: 'Given names', literal: 'Institution name', addAuthor: 'Add author', addEditor: 'Add editor', remove: 'Remove', up: 'Move up', down: 'Move down',
    issued: 'Year or publication date', containerTitle: 'Publication or container title', publisher: 'Publisher', volume: 'Volume', issue: 'Issue', pages: 'Pages', doi: 'DOI', isbn: 'ISBN', language: 'Language', abstract: 'Abstract', description: 'Description', sourceUrl: 'Source URL',
    extra: 'Additional imported fields', fieldName: 'Field name', fieldValue: 'Value', addField: 'Add field', extrasDuplicate: 'Additional field names must be unique.', fieldNameHelp: 'Start with a letter. Use letters, numbers, underscores, colons, periods, or hyphens; no spaces.', dedicatedField: 'Use the named bibliography controls for titles, creators, dates, publication details, and source URLs.', save: 'Save revision', create: 'Create document', saving: 'Saving…', saved: 'Document saved.', failed: 'The document could not be saved. Your entries are preserved. Try again.', conflict: 'This document changed or the citation key is reserved. Your entries are preserved. Close and reopen the document to inspect the latest revision before saving again.',
    readOnly: 'Read-only access', archived: 'Archived', archive: 'Archive document', archiveHelp: 'Archiving removes this document from new selections. Existing citations and files remain available.', confirmArchive: 'Archive this document?', saveBeforeArchive: 'Save your bibliography changes before archiving this document.', cancel: 'Cancel', revision: 'Revision', noValue: 'Not specified',
    upload: 'Add attachment', uploadHelp: 'Add a PDF, image, text, office document, or supplementary file, up to 20 MB. New files create a revision; earlier files remain in history.', chooseFile: 'Choose file', primary: 'Primary file', makePrimary: 'Make primary', download: 'Download', noFiles: 'No attachments in this revision.', bytes: 'bytes', fileInvalid: 'Choose a nonempty file up to 20 MB.', attachmentRemoved: 'Attachment removed from the new revision. Historical revisions retain it.',
    projectFolders: 'Project folders', newTag: 'New descriptive tag', createTag: 'Create and add tag', descriptiveTags: 'Descriptive tags',
    noTags: 'No tags assigned.', allDocuments: 'Tag changes keep this document in All documents and preserve its cited revision.', addTag: 'Add tag', availableTags: 'Available tags', noAvailableTags: 'Every available tag is already assigned.', folder: 'Project folder',
    loading: 'Loading…', loadFailed: 'Could not load this information. Try again.', retry: 'Try again', noUsage: 'This document is not linked to another record.', noHistory: 'No earlier revisions.', lifecycle: 'Activity', at: 'at', publicPage: 'Open citation page', privateHistory: 'Files from earlier revisions are available below.', referenceDetails: 'Reference details', recordId: 'Record identifier', openLegalChange: 'Open legal change',
    types: { misc: 'Other', article: 'Journal article', book: 'Book', inbook: 'Book section', incollection: 'Chapter in collection', inproceedings: 'Conference paper', techreport: 'Report', online: 'Webpage', legislation: 'Legislation', treaty: 'Treaty', phdthesis: 'Doctoral thesis', mastersthesis: 'Master’s thesis', manual: 'Manual', unpublished: 'Unpublished' },
    targetTypes: { constitution: 'Constitution', version: 'Constitution version', amendment: 'Legal change', country_wiki: 'Country wiki', constitution_wiki: 'Constitution wiki', jurisdiction_wiki: 'Jurisdiction wiki', amendment_material: 'Amendment commentary', change_material: 'Changed-passage commentary', lifecycle_material: 'Lifecycle-event commentary' },
    renameTag: 'Rename tag', tagName: 'Tag name', saveTag: 'Save tag name',
    events: { created: 'Document created', revised: 'Metadata updated', file_uploaded: 'Primary file replaced', attachment_added: 'File added', attachment_removed: 'File removed', primary_attachment_changed: 'Primary file changed', tag_added: 'Tag added', tag_removed: 'Tag removed', archived: 'Document archived' },
    eventFallback: 'Document changed',
  },
  de: {
    empty: 'Wählen Sie ein Dokument aus, um Literaturangaben, Dateien und Verlauf zu sehen.', new: 'Neues Dokument', close: 'Zurück zu den Dokumenten', bibliography: 'Literaturangaben', files: 'Dateien', tags: 'Schlagwörter', usage: 'Verwendung', history: 'Verlauf',
    title: 'Titel', key: 'Zitierschlüssel', keyHelp: 'Mit einem Buchstaben beginnen. Erlaubt sind Buchstaben, Ziffern, Unterstriche, Doppelpunkte und Bindestriche. Leer lassen, um einen Schlüssel zu erzeugen.', suggest: 'Schlüssel vorschlagen', copy: 'Schlüssel kopieren', copied: 'Zitierschlüssel kopiert.', unavailable: 'Die Verfügbarkeit konnte nicht geprüft werden. Der Schlüssel wird beim Speichern geprüft.', checking: 'Schlüssel wird geprüft…', available: 'Schlüssel verfügbar.', taken: 'Dieser Schlüssel ist bereits reserviert. Wählen Sie einen anderen.', invalid: '1–128 Zeichen verwenden, beginnend mit einem Buchstaben.',
    type: 'Dokumenttyp', authors: 'Autoren', editors: 'Herausgeber', person: 'Person', institution: 'Institution', family: 'Nachname', given: 'Vornamen', literal: 'Name der Institution', addAuthor: 'Autor hinzufügen', addEditor: 'Herausgeber hinzufügen', remove: 'Entfernen', up: 'Nach oben', down: 'Nach unten',
    issued: 'Jahr oder Veröffentlichungsdatum', containerTitle: 'Publikation oder Sammelwerk', publisher: 'Verlag', volume: 'Band', issue: 'Ausgabe', pages: 'Seiten', doi: 'DOI', isbn: 'ISBN', language: 'Sprache', abstract: 'Zusammenfassung', description: 'Beschreibung', sourceUrl: 'Quell-URL',
    extra: 'Weitere importierte Felder', fieldName: 'Feldname', fieldValue: 'Wert', addField: 'Feld hinzufügen', extrasDuplicate: 'Die Namen zusätzlicher Felder müssen eindeutig sein.', fieldNameHelp: 'Mit einem Buchstaben beginnen. Erlaubt sind Buchstaben, Ziffern, Unterstriche, Doppelpunkte, Punkte und Bindestriche; keine Leerzeichen.', dedicatedField: 'Verwenden Sie für Titel, Urheber, Daten, Publikationsangaben und Quell-URLs die benannten Literaturfelder.', save: 'Revision speichern', create: 'Dokument erstellen', saving: 'Wird gespeichert…', saved: 'Dokument gespeichert.', failed: 'Das Dokument konnte nicht gespeichert werden. Ihre Eingaben bleiben erhalten. Versuchen Sie es erneut.', conflict: 'Dieses Dokument wurde geändert oder der Zitierschlüssel ist reserviert. Ihre Eingaben bleiben erhalten. Schließen und öffnen Sie das Dokument erneut, um die aktuelle Revision vor dem Speichern zu prüfen.',
    readOnly: 'Nur Lesezugriff', archived: 'Archiviert', archive: 'Dokument archivieren', archiveHelp: 'Archivierte Dokumente werden nicht mehr für neue Verknüpfungen angeboten. Bestehende Zitate und Dateien bleiben verfügbar.', confirmArchive: 'Dieses Dokument archivieren?', saveBeforeArchive: 'Speichern Sie Ihre Literaturangaben, bevor Sie dieses Dokument archivieren.', cancel: 'Abbrechen', revision: 'Revision', noValue: 'Nicht angegeben',
    upload: 'Datei hinzufügen', uploadHelp: 'PDF, Bild, Text, Office-Dokument oder ergänzende Datei bis 20 MB hinzufügen. Neue Dateien erzeugen eine Revision; frühere Dateien bleiben im Verlauf.', chooseFile: 'Datei auswählen', primary: 'Hauptdatei', makePrimary: 'Als Hauptdatei festlegen', download: 'Herunterladen', noFiles: 'Keine Dateien in dieser Revision.', bytes: 'Bytes', fileInvalid: 'Wählen Sie eine nicht leere Datei mit höchstens 20 MB.', attachmentRemoved: 'Die Datei wurde aus der neuen Revision entfernt. Frühere Revisionen behalten sie.',
    projectFolders: 'Projektordner', newTag: 'Neues beschreibendes Schlagwort', createTag: 'Schlagwort erstellen und hinzufügen', descriptiveTags: 'Beschreibende Schlagwörter',
    noTags: 'Keine Schlagwörter zugewiesen.', allDocuments: 'Schlagwortänderungen behalten das Dokument unter Alle Dokumente und ändern seine zitierte Revision nicht.', addTag: 'Schlagwort hinzufügen', availableTags: 'Verfügbare Schlagwörter', noAvailableTags: 'Alle verfügbaren Schlagwörter sind bereits zugewiesen.', folder: 'Projektordner',
    loading: 'Wird geladen…', loadFailed: 'Diese Informationen konnten nicht geladen werden. Versuchen Sie es erneut.', retry: 'Erneut versuchen', noUsage: 'Dieses Dokument ist noch nicht mit einem anderen Datensatz verknüpft.', noHistory: 'Keine früheren Revisionen.', lifecycle: 'Aktivitäten', at: 'um', publicPage: 'Zitierseite öffnen', privateHistory: 'Dateien früherer Revisionen sind unten verfügbar.', referenceDetails: 'Verweisdetails', recordId: 'Datensatzkennung', openLegalChange: 'Rechtsänderung öffnen',
    types: { misc: 'Sonstiges', article: 'Zeitschriftenartikel', book: 'Buch', inbook: 'Buchabschnitt', incollection: 'Sammelbandbeitrag', inproceedings: 'Konferenzbeitrag', techreport: 'Bericht', online: 'Webseite', legislation: 'Rechtsvorschrift', treaty: 'Vertrag', phdthesis: 'Dissertation', mastersthesis: 'Masterarbeit', manual: 'Handbuch', unpublished: 'Unveröffentlicht' },
    targetTypes: { constitution: 'Verfassung', version: 'Verfassungsfassung', amendment: 'Rechtsänderung', country_wiki: 'Länderwiki', constitution_wiki: 'Verfassungswiki', jurisdiction_wiki: 'Gebietswiki', amendment_material: 'Änderungskommentar', change_material: 'Kommentar zu einer Änderungspassage', lifecycle_material: 'Ereigniskommentar' },
    renameTag: 'Schlagwort umbenennen', tagName: 'Schlagwortname', saveTag: 'Schlagwortnamen speichern',
    events: { created: 'Dokument erstellt', revised: 'Literaturangaben aktualisiert', file_uploaded: 'Hauptdatei ersetzt', attachment_added: 'Datei hinzugefügt', attachment_removed: 'Datei entfernt', primary_attachment_changed: 'Hauptdatei geändert', tag_added: 'Schlagwort hinzugefügt', tag_removed: 'Schlagwort entfernt', archived: 'Dokument archiviert' },
    eventFallback: 'Dokument geändert',
  },
};

type Props = {
  embedded?: boolean;
  document: DocumentRecord | null;
  writable: boolean;
  createMode?: boolean;
  tags?: DocumentTag[];
  folders?: DocumentFolder[];
  onChanged: (document: DocumentRecord) => void;
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
};
type Tab = 'bibliography' | 'files' | 'tags' | 'usage' | 'history';
type KeyStatus = 'checking' | 'available' | 'taken' | 'invalid' | 'unavailable' | '';
type History = { revisions: DocumentRevision[]; events: { id: string; eventType: string; occurredAt: string; actorId?: string }[] };

const bibliographyFields = ['issued', 'containerTitle', 'publisher', 'volume', 'issue', 'pages', 'doi', 'isbn', 'language'] as const;
const emptyBibliography: DocumentBibliography = { type: 'misc', authors: [], editors: [], extra: {} };
const keyPattern = /^[A-Za-z][A-Za-z0-9_:-]{0,127}$/;
const extraFieldPattern = /^[A-Za-z][A-Za-z0-9_:.-]*$/;
const dedicatedFields = new Set(['title', 'author', 'editor', 'year', 'date', 'journal', 'booktitle', 'publisher', 'volume', 'number', 'pages', 'doi', 'isbn', 'language', 'abstract', 'url', 'note', 'type']);

function codecField(name: string): boolean {
  return name.startsWith('$bibtex.raw.') || name.startsWith('$bibtex.value.');
}

function editableExtra(extra: Record<string, string> = {}): { name: string; value: string }[] {
  return Object.entries(extra).filter(([name]) => !codecField(name)).map(([name, value]) => ({ name, value }));
}

function preservedExtra(extra: Record<string, string> = {}): Record<string, string> {
  return Object.fromEntries(Object.entries(extra).filter(([name]) => codecField(name)));
}

function creatorName(creator: DocumentCreator): string {
  return creator.literal || [creator.given, creator.family].filter(Boolean).join(' ');
}

function metadataSnapshot(title: string, citationKey: string, description: string, sourceUrl: string, bibliography: DocumentBibliography, extra: { name: string; value: string }[]): string {
  const creators = (values: DocumentCreator[]) => values.map(creator => creator.literal?.trim()
    ? { literal: creator.literal.trim() }
    : { family: creator.family?.trim() ?? '', given: creator.given?.trim() ?? '' })
    .filter(creator => Object.values(creator).some(Boolean));
  return JSON.stringify({
    title: title.trim(), citationKey: citationKey.trim(), description: description.trim(), sourceUrl: sourceUrl.trim(),
    bibliography: {
      type: bibliography.type || 'misc', authors: creators(bibliography.authors ?? []), editors: creators(bibliography.editors ?? []),
      ...Object.fromEntries([...bibliographyFields, 'abstract'].map(field => [field, String(bibliography[field as keyof DocumentBibliography] ?? '').trim()])),
      extra: extra.map(field => ({ name: field.name.trim(), value: field.value.trim() }))
        .filter(field => field.name || field.value).sort((left, right) => left.name.localeCompare(right.name)),
    },
  });
}

function downloadHref(documentId: string, revision: number, attachmentId?: string): string {
  const query = new URLSearchParams({ action: 'file', documentId, revision: String(revision) });
  if (attachmentId) query.set('attachmentId', attachmentId);
  return `/documents/command?${query}`;
}

function usageHref(usage: DocumentLinkEvent): string | undefined {
  if (['amendment','amendment_material','change_material'].includes(usage.targetType)) return `/editor/amendments/${encodeURIComponent(usage.targetId)}`;
  return undefined;
}

export function DocumentInspector(props: Props) {
  const locale = useLocale();
  const text = labels[locale];
  if (!props.document && !props.createMode) return <p className={styles.placeholder}>{text.empty}</p>;
  return <InspectorContent key={props.document?.id ?? 'new'} {...props} />;
}

function initialMetadata(selected: DocumentRecord | null | undefined) {
  return {
    title: selected?.revision.title ?? '', citationKey: selected?.citationKey ?? selected?.revision.citationKey ?? '',
    description: selected?.revision.description ?? '', sourceUrl: selected?.revision.sourceUrl ?? '',
    bibliography: { ...emptyBibliography, ...selected?.revision.bibliography },
    extra: editableExtra(selected?.revision.bibliography?.extra), codecExtra: preservedExtra(selected?.revision.bibliography?.extra),
  };
}

function InspectorContent({ document: selected, writable, createMode = false, tags = [], folders = [], onChanged, onClose, onDirtyChange, embedded }: Props) {
  const locale = useLocale();
  const text = labels[locale];
  const idPrefix = useId();
  const canEdit = writable && (!selected || selected.status === 'active');
  const [tab, setTab] = useState<Tab>('bibliography');
  const initial = initialMetadata(selected);
  const [title, setTitle] = useState(initial.title);
  const [citationKey, setCitationKey] = useState(initial.citationKey);
  const [description, setDescription] = useState(initial.description);
  const [sourceUrl, setSourceUrl] = useState(initial.sourceUrl);
  const [bibliography, setBibliography] = useState<DocumentBibliography>(initial.bibliography);
  const [extra, setExtra] = useState(initial.extra);
  const [codecExtra, setCodecExtra] = useState(initial.codecExtra);
  const [savedMetadata, setSavedMetadata] = useState(() => metadataSnapshot(initial.title, initial.citationKey, initial.description, initial.sourceUrl, initial.bibliography, initial.extra));
  const [keyStatus, setKeyStatus] = useState<KeyStatus>('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [history, setHistory] = useState<History | null>(null);
  const [usage, setUsage] = useState<DocumentLinkEvent[] | null>(null);
  const [loadPending, setLoadPending] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [tagToAdd, setTagToAdd] = useState('');
  const [newTag, setNewTag] = useState('');
  const [renamingTag, setRenamingTag] = useState<DocumentTag | null>(null);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const dirty = canEdit && metadataSnapshot(title, citationKey, description, sourceUrl, bibliography, extra) !== savedMetadata;

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => { onDirtyChange?.(false); }, [onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    return () => { window.removeEventListener('beforeunload', beforeUnload); };
  }, [dirty]);

  useEffect(() => {
    if (!citationKey || !keyPattern.test(citationKey) || !canEdit) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const query = new URLSearchParams({ action: 'key-availability', key: citationKey });
      if (selected) query.set('documentId', selected.id);
      void fetch(`/documents/command?${query}`, { signal: controller.signal }).then(async response => {
        if (!response.ok) throw new Error('key');
        const result = await response.json() as { available: boolean; valid: boolean };
        setKeyStatus(!result.valid ? 'invalid' : result.available ? 'available' : 'taken');
      }).catch(() => { if (!controller.signal.aborted) setKeyStatus('unavailable'); });
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [citationKey, selected, canEdit]);

  const assignedTags = (selected?.tags ?? []).filter(tag => !folders.some(folder => folder.tagId === tag.id));
  const availableTags = tags.filter(tag => !folders.some(folder => folder.tagId === tag.id) && !assignedTags.some(assigned => assigned.id === tag.id));
  const attachments = selected?.revision.attachments ?? [];

  async function command(body: Record<string, unknown> | FormData, success?: string) {
    if (!canEdit || pending) return;
    if (!(body instanceof FormData) && body.command === 'archive' && dirty) { setError(text.saveBeforeArchive); return; }
    setPending(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/documents/command', body instanceof FormData ? { method: 'POST', body } : {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!response.ok) {
        setError(response.status === 409 ? text.conflict : text.failed);
        return;
      }
      const result = await response.json() as DocumentRecord | { document: DocumentRecord };
      const next = 'document' in result ? result.document : result;
      if (!(body instanceof FormData) && (body.command === 'create' || body.command === 'revise')) {
        setTitle(next.revision.title);
        setCitationKey(next.citationKey ?? next.revision.citationKey ?? '');
        setDescription(next.revision.description ?? '');
        setSourceUrl(next.revision.sourceUrl ?? '');
        setBibliography({ ...emptyBibliography, ...next.revision.bibliography });
        setExtra(editableExtra(next.revision.bibliography?.extra));
        setCodecExtra(preservedExtra(next.revision.bibliography?.extra));
        setSavedMetadata(metadataSnapshot(next.revision.title, next.citationKey ?? next.revision.citationKey ?? '', next.revision.description ?? '', next.revision.sourceUrl ?? '',
          { ...emptyBibliography, ...next.revision.bibliography }, editableExtra(next.revision.bibliography?.extra)));
      }
      setHistory(null);
      setUsage(null);
      onChanged(next);
      if (success) setNotice(success);
    } catch { setError(text.failed); }
    finally { setPending(false); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const names = extra.map(field => field.name.trim()).filter(Boolean);
    if (new Set(names.map(name => name.toLowerCase())).size !== names.length) { setError(text.extrasDuplicate); return; }
    if (extra.some(field => (field.name.trim() || field.value.trim()) && !extraFieldPattern.test(field.name.trim()))) { setError(text.fieldNameHelp); return; }
    if (names.some(name => dedicatedFields.has(name.toLowerCase()) && !Object.keys(bibliography.extra).some(existing => existing.toLowerCase() === name.toLowerCase()))) { setError(text.dedicatedField); return; }
    const creators = (values: DocumentCreator[] | undefined) => (values ?? []).filter(creator => Boolean(creatorName(creator).trim()));
    await command({
      command: selected ? 'revise' : 'create', documentId: selected?.id, expectedRevision: selected?.currentRevision,
      title, citationKey: citationKey || undefined, description, sourceUrl,
      bibliography: { ...bibliography, authors: creators(bibliography.authors), editors: creators(bibliography.editors), extra: { ...codecExtra, ...Object.fromEntries(extra.filter(field => field.name.trim()).map(field => [field.name.trim(), field.value])) } },
    }, text.saved);
  }

  async function addNewTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || pending || !selected || !newTag.trim()) return;
    setPending(true); setError('');
    try {
      const result = await libraryCommand<{ tag: DocumentTag }>({ command: 'tag-create', name: newTag.trim() });
      const assigned = await libraryCommand<{ document: DocumentRecord }>({ command: 'tag-add', documentId: selected.id, tagId: result.tag.id });
      setNewTag(''); onChanged(assigned.document);
    } catch { setError(text.failed); }
    finally { setPending(false); }
  }

  async function renameTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || pending || !selected || !renamingTag?.name.trim()) return;
    setPending(true); setError('');
    try {
      const { tag } = await libraryCommand<{ tag: DocumentTag }>({ command: 'tag-rename', tagId: renamingTag.id, name: renamingTag.name.trim() });
      onChanged({ ...selected, tags: selected.tags?.map(current => current.id === tag.id ? tag : current) });
      setRenamingTag(null);
    } catch { setError(text.failed); }
    finally { setPending(false); }
  }

  function renderTagRename() {
    if (!canEdit || !renamingTag) return null;
    return <Inline as="form" align="end" onSubmit={renameTag}>
      <Input label={text.tagName} value={renamingTag.name} required maxLength={120} disabled={pending} onChange={event => setRenamingTag({ ...renamingTag, name: event.target.value })} />
      <Button disabled={pending || !renamingTag.name.trim()}>{text.saveTag}</Button>
      <Button type="button" variant="ghost" disabled={pending} onClick={() => setRenamingTag(null)}>{text.cancel}</Button>
    </Inline>;
  }

  async function load(nextTab: Tab) {
    setTab(nextTab);
    setLoadError(false);
    if (!selected || (nextTab !== 'usage' && nextTab !== 'history')) return;
    if ((nextTab === 'usage' && usage) || (nextTab === 'history' && history)) return;
    setLoadPending(true);
    try {
      const query = new URLSearchParams({ action: nextTab, documentId: selected.id });
      const response = await fetch(`/documents/command?${query}`);
      if (!response.ok) throw new Error(nextTab);
      const value = await response.json();
      if (nextTab === 'history') setHistory(value as History);
      else setUsage(Array.isArray(value) ? value : (value as { usage: DocumentLinkEvent[] }).usage);
    } catch { setLoadError(true); }
    finally { setLoadPending(false); }
  }

  function updateCreators(field: 'authors' | 'editors', creators: DocumentCreator[]) {
    setBibliography(previous => ({ ...previous, [field]: creators }));
  }

  function creatorFields(field: 'authors' | 'editors') {
    const values = bibliography[field] ?? [];
    return <Stack as="fieldset" gap="control" className={styles.creatorGroup}>
      <legend>{text[field]}</legend>
      {values.map((creator, index) => {
        const institution = creator.literal !== undefined && creator.literal !== null;
        const fieldId = `${idPrefix}-${field}-${index}`;
        const change = (value: DocumentCreator) => updateCreators(field, values.map((item, i) => i === index ? value : item));
        return <Stack key={index} gap="related" className={styles.creator}>
          <Select id={`${fieldId}-kind`} label={`${text[field]} ${index + 1}`} value={institution ? 'institution' : 'person'} onChange={event => change(event.target.value === 'institution' ? { literal: creatorName(creator) } : { family: creator.literal ?? creator.family ?? '', given: creator.given ?? '' })}>
            <option value="person">{text.person}</option><option value="institution">{text.institution}</option>
          </Select>
          {institution ? <Input id={`${fieldId}-literal`} label={text.literal} value={creator.literal ?? ''} onChange={event => change({ literal: event.target.value })} /> : <Grid columns={2} gap="control">
            <Input id={`${fieldId}-family`} label={text.family} value={creator.family ?? ''} onChange={event => change({ ...creator, family: event.target.value })} />
            <Input id={`${fieldId}-given`} label={text.given} value={creator.given ?? ''} onChange={event => change({ ...creator, given: event.target.value })} />
          </Grid>}
          <Inline gap="related">
            <Button type="button" variant="ghost" disabled={index === 0} onClick={() => { const moved = [...values]; [moved[index - 1], moved[index]] = [moved[index], moved[index - 1]]; updateCreators(field, moved); }} aria-label={`${text.up}: ${creatorName(creator) || index + 1}`}>↑</Button>
            <Button type="button" variant="ghost" disabled={index === values.length - 1} onClick={() => { const moved = [...values]; [moved[index + 1], moved[index]] = [moved[index], moved[index + 1]]; updateCreators(field, moved); }} aria-label={`${text.down}: ${creatorName(creator) || index + 1}`}>↓</Button>
            <Button type="button" variant="ghost" onClick={() => updateCreators(field, values.filter((_, i) => i !== index))}>{text.remove}</Button>
          </Inline>
        </Stack>;
      })}
      <Button type="button" variant="ghost" onClick={() => updateCreators(field, [...values, { family: '', given: '' }])}>{field === 'authors' ? text.addAuthor : text.addEditor}</Button>
    </Stack>;
  }

  function fileList(files: DocumentAttachment[], revision: number, editable = false) {
    if (!selected) return null;
    return <ul className={styles.fileList}>{files.map(file => <li key={file.id}>
      <Stack gap="related">
        <strong className={styles.fileName}>{file.fileName}</strong>
        <span className={styles.meta}>{file.contentType} · {new Intl.NumberFormat(locale).format(file.size)} {text.bytes}</span>
        {file.primary ? <Badge>{text.primary}</Badge> : null}
        <Inline gap="related">
          <a className="btn btn-secondary" href={downloadHref(selected.id, revision, file.id)}>{text.download}</a>
          {editable && !file.primary ? <Button type="button" disabled={pending} onClick={() => void command({ command: 'attachment-primary', documentId: selected.id, expectedRevision: selected.currentRevision, attachmentId: file.id })}>{text.makePrimary}</Button> : null}
          {editable ? <Button type="button" variant="ghost" disabled={pending} onClick={() => void command({ command: 'attachment-remove', documentId: selected.id, expectedRevision: selected.currentRevision, attachmentId: file.id }, text.attachmentRemoved)}>{text.remove}</Button> : null}
        </Inline>
      </Stack>
    </li>)}</ul>;
  }

  function activityLabel(eventType: string): string {
    const [kind, tagId] = eventType.split(':', 2);
    const label = text.events[kind as keyof typeof text.events] ?? text.eventFallback;
    if (kind !== 'tag_added' && kind !== 'tag_removed') return label;
    const tagName = tags.find(tag => tag.id === tagId)?.name ?? folders.find(folder => folder.tagId === tagId)?.name;
    return tagName ? `${label}: ${tagName}` : label;
  }

  function renderEditableBibliography() {
    return <Stack as="form" gap="field" onSubmit={save} aria-busy={pending}><Stack as="fieldset" gap="field" disabled={pending} className={styles.formFields}>
      <Grid columns={3} variant="form">
      <Input id={`${idPrefix}-title`} label={text.title} required maxLength={500} value={title} onChange={event => setTitle(event.target.value)} />
      <Input id={`${idPrefix}-key`} label={text.key} help={text.keyHelp} error={keyStatus === 'taken' ? text.taken : keyStatus === 'invalid' ? text.invalid : undefined} maxLength={128} pattern="[A-Za-z][A-Za-z0-9_:\-]{0,127}" value={citationKey} onChange={event => { const value = event.target.value; setCitationKey(value); setKeyStatus(!value ? '' : keyPattern.test(value) ? 'checking' : 'invalid'); }} />
      <Select id={`${idPrefix}-type`} label={text.type} value={bibliography.type ?? 'misc'} onChange={event => setBibliography(previous => ({ ...previous, type: event.target.value }))}>
        {!Object.hasOwn(text.types, bibliography.type ?? 'misc') ? <option value={bibliography.type}>{bibliography.type}</option> : null}
        {Object.entries(text.types).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </Select>
      </Grid>
      <Inline gap="related">
        <Button type="button" variant="ghost" onClick={() => { const name = bibliography.authors?.[0]?.family || bibliography.authors?.[0]?.literal || 'Document'; const year = bibliography.issued?.match(/\d{4}/)?.[0] ?? ''; const shortTitle = title.split(/\s+/).slice(0, 3).join(''); const suggestion = `${name}${year}${shortTitle}`.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_:-]/g, '').slice(0, 128); setCitationKey(/^[A-Za-z]/.test(suggestion) ? suggestion : `Document${suggestion}`.slice(0, 128)); setKeyStatus('checking'); }}>{text.suggest}</Button>
        <span className={styles.meta} role="status">{keyStatus === 'checking' ? text.checking : keyStatus === 'available' ? text.available : keyStatus === 'unavailable' ? text.unavailable : ''}</span>
      </Inline>

      <Grid columns={2}>{creatorFields('authors')}{creatorFields('editors')}</Grid>
      <Grid columns={2} variant="form" gap="field">{bibliographyFields.map(field => <Input key={field} id={`${idPrefix}-${field}`} label={text[field]} value={bibliography[field] ?? ''} onChange={event => setBibliography(previous => ({ ...previous, [field]: event.target.value }))} />)}</Grid>
      <TextArea id={`${idPrefix}-abstract`} label={text.abstract} rows={4} value={bibliography.abstract ?? ''} onChange={event => setBibliography(previous => ({ ...previous, abstract: event.target.value }))} />
      <TextArea id={`${idPrefix}-description`} label={text.description} rows={3} value={description} onChange={event => setDescription(event.target.value)} />
      <Input id={`${idPrefix}-source`} label={text.sourceUrl} type="url" value={sourceUrl} onChange={event => setSourceUrl(event.target.value)} />
      <details className={styles.details}><summary>{text.extra}</summary><Stack gap="field">
        {extra.map((field, index) => <Stack key={index} gap="related">
          <Input id={`${idPrefix}-extra-name-${index}`} label={text.fieldName} help={text.fieldNameHelp} pattern="[A-Za-z][A-Za-z0-9_:.\-]*" required={Boolean(field.value)} value={field.name} onChange={event => setExtra(previous => previous.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} />
          <TextArea id={`${idPrefix}-extra-value-${index}`} label={text.fieldValue} value={field.value} onChange={event => setExtra(previous => previous.map((item, i) => i === index ? { ...item, value: event.target.value } : item))} />
          <Button type="button" variant="ghost" onClick={() => setExtra(previous => previous.filter((_, i) => i !== index))}>{text.remove}</Button>
        </Stack>)}
        <Button type="button" onClick={() => setExtra(previous => [...previous, { name: '', value: '' }])}>{text.addField}</Button>
      </Stack></details>
      <Button variant="primary" disabled={pending || keyStatus === 'invalid' || keyStatus === 'taken'}>{pending ? text.saving : selected ? text.save : text.create}</Button>
      {selected ? <details className={styles.details}><summary>{text.archive}</summary><Stack gap="control"><p className={styles.meta}>{text.archiveHelp}</p>{archiveConfirm ? <><p>{text.confirmArchive}</p><Inline><Button type="button" disabled={pending} onClick={() => void command({ command: 'archive', documentId: selected.id })}>{text.archive}</Button><Button type="button" variant="ghost" onClick={() => setArchiveConfirm(false)}>{text.cancel}</Button></Inline></> : <Button type="button" variant="ghost" onClick={() => setArchiveConfirm(true)}>{text.archive}</Button>}</Stack></details> : null}
    </Stack></Stack>;
  }

  function renderReadOnlyBibliography() {
    return <Stack gap="field">
      <dl className={styles.metadata}>
        <dt>{text.key}</dt><dd>{selected?.citationKey || text.noValue}</dd>
        <dt>{text.type}</dt><dd>{text.types[bibliography.type as keyof typeof text.types] ?? bibliography.type}</dd>
        {(['authors', 'editors'] as const).map(field => <div key={field}><dt>{text[field]}</dt><dd>{bibliography[field]?.map(creatorName).join('; ') || text.noValue}</dd></div>)}
        {bibliographyFields.filter(field => bibliography[field]).map(field => <div key={field}><dt>{text[field]}</dt><dd>{bibliography[field]}</dd></div>)}
      </dl>
      {bibliography.abstract ? <Stack gap="related"><h3>{text.abstract}</h3><p className={styles.prose}>{bibliography.abstract}</p></Stack> : null}
      {description ? <Stack gap="related"><h3>{text.description}</h3><p className={styles.prose}>{description}</p></Stack> : null}
      {sourceUrl ? <a href={sourceUrl} rel="noreferrer">{text.sourceUrl}</a> : null}
      {extra.length ? <details className={styles.details}><summary>{text.extra}</summary><dl className={styles.metadata}>{extra.map(field => <div key={field.name}><dt>{field.name}</dt><dd>{field.value}</dd></div>)}</dl></details> : null}
    </Stack>;
  }

  function renderFiles() {
    if (!selected) return null;
    return <Stack gap="field">
      {attachments.length ? fileList(attachments, selected.revision.revision, canEdit) : selected.revision.fileName ? <a className="btn btn-secondary" href={downloadHref(selected.id, selected.revision.revision)}>{text.download}: {selected.revision.fileName}</a> : <p>{text.noFiles}</p>}
      {canEdit ? <Stack as="form" gap="control" onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const file = form.get('file');
        if (!(file instanceof File) || !file.size || file.size > 20 * 1024 * 1024) { setError(text.fileInvalid); return; }
        form.set('command', 'attachment-add'); form.set('documentId', selected.id); form.set('expectedRevision', String(selected.currentRevision));
        void command(form);
      }}>
        <Input id={`${idPrefix}-file`} label={text.chooseFile} help={text.uploadHelp} name="file" type="file" required />
        <Button disabled={pending}>{text.upload}</Button>
      </Stack> : null}
    </Stack>;
  }

  function renderTags() {
    if (!selected) return null;
    return <Stack gap="field">
      <p className={styles.meta}>{text.allDocuments}</p>
      {folders.length ? <fieldset className={styles.creatorGroup}><legend>{text.projectFolders}</legend><ul className={styles.tagList}>{folders.map(folder => <li key={folder.id}><label><input type="checkbox" checked={(selected.tags ?? []).some(tag => tag.id === folder.tagId)} disabled={!canEdit || pending} onChange={event => void command({ command: event.target.checked ? 'tag-add' : 'tag-remove', documentId: selected.id, tagId: folder.tagId })} /> {folder.name}</label></li>)}</ul></fieldset> : null}
      <h3>{text.descriptiveTags}</h3>
      {assignedTags.length ? <ul className={styles.tagList}>{assignedTags.map(tag => <li key={tag.id}><span>{tag.name}</span>{canEdit ? <Button type="button" variant="ghost" disabled={pending} onClick={() => setRenamingTag(tag)} aria-label={`${text.renameTag}: ${tag.name}`}>{text.renameTag}</Button> : null}{canEdit ? <Button type="button" variant="ghost" disabled={pending} onClick={() => void command({ command: 'tag-remove', documentId: selected.id, tagId: tag.id })} aria-label={`${text.remove}: ${tag.name}`}>{text.remove}</Button> : null}</li>)}</ul> : <p>{text.noTags}</p>}
      {renderTagRename()}
      {canEdit && availableTags.length ? <Inline as="form" align="end" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (tagToAdd) void command({ command: 'tag-add', documentId: selected.id, tagId: tagToAdd }); }}>
        <Select id={`${idPrefix}-tag`} label={text.availableTags} value={tagToAdd} onChange={event => setTagToAdd(event.target.value)} required><option value="">—</option>{availableTags.map(tag => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</Select>
        <Button disabled={pending || !tagToAdd}>{text.addTag}</Button>
      </Inline> : null}
      {canEdit && !availableTags.length ? <p className={styles.meta}>{text.noAvailableTags}</p> : null}
      {canEdit ? <Inline as="form" align="end" onSubmit={addNewTag}><Input label={text.newTag} value={newTag} required maxLength={120} disabled={pending} onChange={event => setNewTag(event.target.value)} /><Button disabled={pending || !newTag.trim()}>{text.createTag}</Button></Inline> : null}
    </Stack>;
  }

  function renderHistory() {
    if (!selected || !history || loadPending || loadError) return null;
    return <Stack gap="field">
      <p className={styles.meta}>{text.privateHistory}</p>
      {history.revisions.length ? <ol className={styles.history}>{history.revisions.map(revision => <li key={revision.id}><Stack gap="related">
        <strong>{text.revision} {revision.revision}: {revision.title}</strong>
        {revision.citationKey ? <code className={styles.key}>{revision.citationKey}</code> : null}
        <span className={styles.meta}>{new Date(revision.createdAt).toLocaleString(locale)}</span>
        {revision.attachments?.length ? fileList(revision.attachments, revision.revision) : revision.fileName ? <a href={downloadHref(selected.id, revision.revision)}>{text.download}: {revision.fileName}</a> : null}
      </Stack></li>)}</ol> : <p>{text.noHistory}</p>}
      {history.events.length ? <Stack gap="control"><h3>{text.lifecycle}</h3><ol className={styles.history}>{history.events.map(event => <li key={event.id}><span>{activityLabel(event.eventType)}</span><span className={styles.meta}> · <time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleString(locale)}</time></span></li>)}</ol></Stack> : null}
    </Stack>;
  }

  function renderUsage() {
    if (!usage || loadPending || loadError) return null;
    return usage.length ? <ul className={styles.tagList}>{usage.map(item => <li key={item.id}><Stack gap="related"><strong>{text.targetTypes[item.targetType]}</strong>{usageHref(item) ? <a href={usageHref(item)}>{text.openLegalChange}</a> : null}<span className={styles.meta}>{new Date(item.occurredAt).toLocaleString(locale)}</span><details className={styles.details}><summary>{text.referenceDetails}</summary><dl className={styles.metadata}><dt>{text.recordId}</dt><dd><code className={styles.key}>{item.targetId}</code></dd></dl></details></Stack></li>)}</ul> : <p>{text.noUsage}</p>;
  }

  function renderHeading() {
    return <>
    {!embedded ? <Inline align="start" className={styles.heading}>
      <Stack gap="related">
        <h2>{selected?.revision.title ?? text.new}</h2>
        {selected ? <span className={styles.meta}>{text.revision} {selected.currentRevision}{selected.status === 'archived' ? ` · ${text.archived}` : ''}</span> : null}
      </Stack>
      <Button type="button" variant="ghost" onClick={onClose}>{text.close}</Button>
    </Inline> : selected ? <span className={styles.meta}>{text.revision} {selected.currentRevision}{selected.status === 'archived' ? ` · ${text.archived}` : ''}</span> : null}
    {!writable ? <Badge>{text.readOnly}</Badge> : null}
    {selected?.citationKey ? <Inline gap="related"><code className={styles.key}>{selected.citationKey}</code><Button type="button" variant="ghost" onClick={() => { void navigator.clipboard?.writeText(selected.citationKey ?? '').then(() => setNotice(text.copied)).catch(() => setError(text.failed)); }}>{text.copy}</Button></Inline> : null}
    {error ? <Alert tone="error">{error}</Alert> : null}
    {notice ? <Alert tone="success">{notice}</Alert> : null}
    {selected ? <nav className={styles.tabs} aria-label={selected.revision.title}>{(['bibliography', 'files', 'tags', 'usage', 'history'] as Tab[]).map(value => <Button key={value} type="button" variant={tab === value ? 'primary' : 'ghost'} aria-pressed={tab === value} onClick={() => void load(value)}>{text[value]}</Button>)}</nav> : null}

    </>;
  }

  function renderPanels() {
    return <>
    {tab === 'bibliography' ? (canEdit ? renderEditableBibliography() : renderReadOnlyBibliography()) : null}

    {tab === 'files' ? renderFiles() : null}

    {tab === 'tags' ? renderTags() : null}

    {(tab === 'usage' || tab === 'history') && loadPending ? <p role="status">{text.loading}</p> : null}
    {(tab === 'usage' || tab === 'history') && loadError ? <Stack gap="control"><Alert tone="error">{text.loadFailed}</Alert><Button type="button" onClick={() => void load(tab)}>{text.retry}</Button></Stack> : null}
    {tab === 'usage' ? renderUsage() : null}
    {tab === 'history' ? renderHistory() : null}    </>;
  }

  return <Stack as="section" gap="field" className={embedded ? styles.embedded : styles.inspector} aria-label={createMode ? text.new : selected?.revision.title}>
    {renderHeading()}
    {renderPanels()}
  </Stack>;
}
