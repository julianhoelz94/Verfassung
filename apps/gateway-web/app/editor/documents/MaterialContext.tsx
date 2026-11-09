'use client';

import { useId, useRef, useState } from 'react';
import type { DocumentLink } from '../../../lib/document-api';
import { useTranslation } from '../../components/TranslationProvider';
import { Input, TextArea, Button } from '../../components/ui';
import { Stack } from '../../components/layout/Layout';

/** Material editing advances only this owner's pin; other scopes keep their snapshot. */
export function MaterialContext({ link, canEdit, pending, onSave }: {
  link: DocumentLink; canEdit: boolean; pending: boolean; onSave: (data: FormData) => Promise<boolean>;
}) {
  const id = useId(), group = useRef<HTMLDivElement>(null), t = useTranslation();
  const copy = (en: string, de: string) => t({ en, de });
  const revision = link.document.revision;
  const commentary = revision.bibliography?.type === 'commentary' || (!revision.fileName && !revision.sourceUrl);
  const [title, setTitle] = useState(revision.title), [description, setDescription] = useState(revision.description ?? ''), [url, setUrl] = useState(revision.sourceUrl ?? '');
  async function save() {
    if (pending || !group.current) return;
    for (const input of group.current.querySelectorAll<HTMLInputElement>('input,textarea')) if (!input.reportValidity()) return;
    const data = new FormData();
    Object.entries({ documentId: link.documentId, expectedRevision: String(revision.revision), expectedLinkedRevisionId: link.revisionId ?? '', title, description, sourceUrl: url }).forEach(([key, value]) => data.set(key, value));
    await onSave(data);
  }
  return <article>
    {revision.description ? commentary ? <p>{revision.description}</p> : <details><summary>{copy('Library note', 'Bibliotheksnotiz')}</summary><p>{revision.description}</p></details> : null}
    {link.citationNote ? <p>{link.citationNote}</p> : null}
    {canEdit ? <details><summary>{copy('Edit material details', 'Materialangaben bearbeiten')}</summary><div ref={group}><Stack>
      <Input form={`${id}-material`} label={copy('Title', 'Titel')} required maxLength={500} value={title} onChange={event => setTitle(event.target.value)} />
      <TextArea form={`${id}-material`} label={copy(commentary ? 'Commentary' : 'Description', commentary ? 'Kommentar' : 'Beschreibung')} maxLength={10000} value={description} onChange={event => setDescription(event.target.value)} />
      <Input form={`${id}-material`} label={copy('Source URL', 'Quell-URL')} type="url" maxLength={2048} value={url} onChange={event => setUrl(event.target.value)} />
      <Button type="button" disabled={pending} onClick={() => void save()}>{copy('Save and publish changes', 'Änderungen speichern und veröffentlichen')}</Button>
    </Stack></div></details> : null}
  </article>;
}
