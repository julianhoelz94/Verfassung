'use client';
import { useState } from 'react';
import type { WikiImage } from '../../../lib/api';
import type { DocumentLink } from '../../../lib/document-api';
import type { DocumentReference } from '../../../lib/document-reference';
import { StagedDocumentPicker } from '../../components/documents/StagedDocumentPicker';
import { Button, Input, Select } from '../../components/ui';
import { Stack, Grid } from '../../components/layout/Layout';
import { useTranslation } from '../../components/TranslationProvider';

export function WikiCitationFields({ citations }: { citations: DocumentReference[] }) {
  const t = useTranslation();
  return <StagedDocumentPicker name="citations" initialReferences={citations} heading={t({ en: 'Document citations', de: 'Dokumentbelege' })} />;
}
/** Image presentation belongs to this Wiki, independently of the library metadata. */
export function WikiImageFields({ existingIds }: { existingIds: string[] }) {
  const t = useTranslation(), copy = (en: string, de: string) => t({ en, de });
  const [images, setImages] = useState<WikiImage[]>([]);
  function choose(link: DocumentLink) {
    if (existingIds.includes(link.documentId) || images.some(image => image.documentId === link.documentId)) return false;
    setImages(current => [...current, { documentId: link.documentId, revision: link.document.revision.revision, alt: '', placement: 'after_body' }]);
    return true;
  }
  return <Stack>
    <StagedDocumentPicker kind="image" headingLevel="h3" heading={copy('Add a picture', 'Bild hinzufügen')} onChoose={choose} />
    <input type="hidden" name="newImages" value={JSON.stringify(images)} />
    {images.map((image, index) => <Stack as="fieldset" key={image.documentId}>
      <legend>{copy('Selected picture', 'Ausgewähltes Bild')} · {index + 1}</legend>
      <a href={`/documents/${image.documentId}?revision=${image.revision}`} target="_blank" rel="noreferrer">{copy('View picture', 'Bild ansehen')}</a>
      <Input label={copy('Alternative text', 'Alternativtext')} name={`alt-${image.documentId}`} required maxLength={500} />
      <details><summary>{copy('Caption, credit and placement', 'Bildunterschrift, Nachweis und Position')}</summary><Grid columns={2} variant="form">
        <Input label={copy('Caption', 'Bildunterschrift')} name={`caption-${image.documentId}`} maxLength={1000} />
        <Input label={copy('Credit', 'Bildnachweis')} name={`credit-${image.documentId}`} maxLength={500} />
        <Input label={copy('Rights', 'Nutzungsrechte')} name={`rights-${image.documentId}`} maxLength={500} />
        <Input label={copy('Source URL', 'Quell-URL')} type="url" name={`source-${image.documentId}`} />
        <Input label={copy('Position', 'Position')} name={`order-${image.documentId}`} type="number" min={1} max={30} defaultValue={existingIds.length + index + 1} />
        <Select label={copy('Placement', 'Platzierung')} name={`placement-${image.documentId}`} defaultValue="after_body"><option value="before_body">{copy('Before text', 'Vor dem Text')}</option><option value="after_body">{copy('After text', 'Nach dem Text')}</option></Select>
      </Grid></details>
      <Button type="button" variant="ghost" onClick={() => setImages(current => current.filter(item => item.documentId !== image.documentId))}>{copy('Remove picture', 'Bild entfernen')}</Button>
    </Stack>)}
  </Stack>;
}
