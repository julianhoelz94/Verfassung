'use client';

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { DocumentBibliography, DocumentCreator } from '../../../lib/document-api';
import { useTranslation } from '../TranslationProvider';
import { Alert, Button, Input, TextArea } from '../ui';
import { Grid, Inline, Stack } from '../layout/Layout';
import { DocumentBibliographyFields } from './DocumentBibliographyFields';
import styles from './DocumentAttachmentTemplate.module.css';

const emptyBibliography = (): DocumentBibliography => ({ type: 'misc', authors: [], editors: [], extra: {} });
const creators = (values: DocumentCreator[]) => values.map(value => value.literal != null
  ? { literal: value.literal.trim() }
  : { family: value.family?.trim() ?? '', given: value.given?.trim() ?? '' }).filter(value => Object.values(value).some(Boolean));

function reportValidity(group: HTMLElement): boolean {
  const fields = group.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input,textarea,select');
  const invalid = Array.from(fields).find(field => !field.checkValidity());
  if (!invalid) return true;
  let ancestor = invalid.parentElement;
  while (ancestor && ancestor !== group) { if (ancestor instanceof HTMLDetailsElement) ancestor.open = true; ancestor = ancestor.parentElement; }
  invalid.reportValidity(); return false;
}

/** No nested form: safe inside an event form or an editor's unsaved draft. */
export function DocumentUploadForm({ pending, onCreate, onCancel, contextFields, accept, fileRequired = false }: { accept?: string; fileRequired?: boolean; contextFields?: ReactNode; pending: boolean; onCreate: (data: FormData) => Promise<boolean>; onCancel: () => void }) {
  const formId = `${useId()}-document-upload`;
  const t = useTranslation(), copy = (en: string, de: string) => t({ en, de });
  const group = useRef<HTMLDivElement>(null), busy = useRef(false);
  const [title, setTitle] = useState(''), [description, setDescription] = useState(''), [sourceUrl, setSourceUrl] = useState(''), [citationKey, setCitationKey] = useState('');
  const [file, setFile] = useState<File | null>(null), [error, setError] = useState('');
  const [bibliography, setBibliography] = useState(emptyBibliography);
  const [extra, setExtra] = useState<{ name: string; value: string }[]>([]);
  async function submit() {
    if (pending || busy.current || !group.current || !reportValidity(group.current)) return;
    if (file && (file.size === 0 || file.size > 20 * 1024 * 1024)) { setError(copy('Choose a nonempty file up to 20 MB.', 'Wähle eine nicht leere Datei mit höchstens 20 MB.')); return; }
    if (!file && (fileRequired || !sourceUrl.trim())) { setError(copy('Choose a file or enter its source URL under Optional details.', 'Wähle eine Datei oder gib ihre Quell-URL unter Optionale Angaben ein.')); return; }
    const populated = extra.filter(field => field.name.trim());
    if (new Set(populated.map(field => field.name.trim().toLowerCase())).size !== populated.length) { setError(copy('Additional field names must be unique.', 'Die Namen zusätzlicher Felder müssen eindeutig sein.')); return; }
    const data = new FormData(); data.set('title', title); data.set('description', description); data.set('sourceUrl', sourceUrl);
    if (citationKey.trim()) data.set('citationKey', citationKey.trim());
    data.set('bibliography', JSON.stringify({ ...bibliography, authors: creators(bibliography.authors), editors: creators(bibliography.editors), extra: Object.fromEntries(populated.map(field => [field.name.trim(), field.value])) }));
    if (file) data.set('file', file);
    busy.current = true; setError('');
    try {
      if (!await onCreate(data)) return;
      setTitle(''); setDescription(''); setSourceUrl(''); setCitationKey(''); setFile(null); setBibliography(emptyBibliography()); setExtra([]);
      const input = group.current?.querySelector<HTMLInputElement>('input[type="file"]'); if (input) input.value = '';
      group.current?.querySelectorAll('details').forEach(details => { details.open = false; });
      onCancel();
    } catch { setError(copy('The document could not be saved. Your entries are preserved.', 'Das Dokument konnte nicht gespeichert werden. Deine Eingaben bleiben erhalten.')); }
    finally { busy.current = false; }
  }
  function keyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement && event.target.type !== 'file') { event.preventDefault(); void submit(); }
  }
  return <div ref={group} onKeyDown={keyDown} className={styles.form}>
    <Stack as="fieldset" disabled={pending} className={styles.fields}>
      <legend className={styles.visuallyHidden}>{copy('New document', 'Neues Dokument')}</legend>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Input form={formId} label={copy('File', 'Datei')} type="file" accept={accept} required={fileRequired} help={fileRequired ? copy('Choose a compatible image, up to 20 MB.', 'Wähle ein passendes Bild mit höchstens 20 MB.') : copy('Up to 20 MB. You can use a source URL instead under Optional details.', 'Bis zu 20 MB. Unter Optionale Angaben kannst du stattdessen eine Quell-URL verwenden.')} onChange={event => { const picked = event.target.files?.[0] ?? null; setFile(picked); setError(''); if (!title && picked) setTitle(picked.name.replace(/\.[^.]+$/, '')); }} />
      <Input form={formId} label={copy('Title', 'Titel')} required maxLength={500} value={title} onChange={event => setTitle(event.target.value)} />
      <details className={styles.details}><summary>{copy('Optional details', 'Optionale Angaben')}</summary><Stack gap="control" className={styles.optionalFields}>
        <Grid columns={2} variant="form" gap="control">
        <Input form={formId} label={copy('Source URL', 'Quell-URL')} type="url" pattern="https?://.*" maxLength={2048} value={sourceUrl} onChange={event => setSourceUrl(event.target.value)} />
        <Input form={formId} label={copy('Citation key', 'Zitierschlüssel')} maxLength={128} pattern="[A-Za-z][A-Za-z0-9_:\-]{0,127}" help={copy('Generated automatically if empty.', 'Wird ohne Angabe automatisch erzeugt.')} value={citationKey} onChange={event => setCitationKey(event.target.value)} />
        </Grid>
        <DocumentBibliographyFields form={formId} value={bibliography} onChange={setBibliography} />
        <details className={styles.details}><summary>{copy('Library note', 'Bibliotheksnotiz')}</summary><TextArea form={formId} label={copy('Description', 'Beschreibung')} help={copy('A catalog note about this document, separate from its published abstract.', 'Eine Katalognotiz zum Dokument, getrennt von seiner veröffentlichten Zusammenfassung.')} rows={2} maxLength={10000} value={description} onChange={event => setDescription(event.target.value)} /></details>
        <details className={styles.details}><summary>{copy('Additional bibliography fields', 'Weitere Literaturfelder')}</summary><Stack gap="field">
          {extra.map((field, index) => <Stack key={index} gap="related">
            <Input form={formId} label={copy('Field name', 'Feldname')} pattern="[A-Za-z][A-Za-z0-9_:.\-]*" required={Boolean(field.value)} value={field.name} onChange={event => setExtra(values => values.map((value, i) => i === index ? { ...value, name: event.target.value } : value))} />
            <TextArea form={formId} label={copy('Value', 'Wert')} value={field.value} onChange={event => setExtra(values => values.map((value, i) => i === index ? { ...value, value: event.target.value } : value))} />
            <Button type="button" variant="ghost" onClick={() => setExtra(values => values.filter((_, i) => i !== index))}>{copy('Remove', 'Entfernen')}</Button>
          </Stack>)}
          <Button type="button" variant="ghost" onClick={() => setExtra(values => [...values, { name: '', value: '' }])}>{copy('Add field', 'Feld hinzufügen')}</Button>
        </Stack></details>
      </Stack></details>
      {contextFields}
      <Inline><Button type="button" variant="primary" disabled={pending} onClick={() => void submit()}>{pending ? copy('Adding…', 'Wird hinzugefügt…') : file ? copy('Upload and attach', 'Hochladen und verknüpfen') : copy('Create and attach', 'Anlegen und verknüpfen')}</Button><Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>{copy('Cancel', 'Abbrechen')}</Button></Inline>
    </Stack>
  </div>;
}
