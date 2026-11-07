'use client';

import type { DocumentBibliography } from '../../../lib/document-api';
import { documentItemTypes } from '../../../lib/document-item-types';
import { useTranslation } from '../TranslationProvider';
import { Input, Select, TextArea } from '../ui';
import { Grid, Stack } from '../layout/Layout';
import { DocumentCreatorFields } from './DocumentCreatorFields';
import styles from './DocumentAttachmentTemplate.module.css';

const fields = [
  ['issued', 'Year or publication date', 'Jahr oder Veröffentlichungsdatum'],
  ['containerTitle', 'Publication or container title', 'Publikation oder Sammelwerk'], ['publisher', 'Publisher', 'Verlag'],
  ['volume', 'Volume', 'Band'], ['issue', 'Issue', 'Ausgabe'], ['pages', 'Pages', 'Seiten'],
  ['doi', 'DOI', 'DOI'], ['isbn', 'ISBN', 'ISBN'], ['language', 'Language', 'Sprache'],
] as const;

export function DocumentBibliographyFields({ value, onChange, form }: { form?: string; value: DocumentBibliography; onChange: (value: DocumentBibliography) => void }) {
  const t = useTranslation(), copy = (en: string, de: string) => t({ en, de });
  return <Stack gap="control">
    <Select form={form} label={copy('Item type', 'Dokumenttyp')} value={value.type} onChange={event => onChange({ ...value, type: event.target.value })}>
      {Object.entries(documentItemTypes).map(([type, label]) => <option key={type} value={type}>{t(label)}</option>)}
    </Select>
    <details className={styles.details}><summary>{copy('Creators', 'Urheber')}</summary><Grid columns={2}>
      <DocumentCreatorFields form={form} kind="authors" value={value.authors} onChange={authors => onChange({ ...value, authors })} />
      <DocumentCreatorFields form={form} kind="editors" value={value.editors} onChange={editors => onChange({ ...value, editors })} />
    </Grid></details>
    <details className={styles.details}><summary>{copy('Publication details', 'Publikationsangaben')}</summary><Stack gap="control">
      <Grid columns={3} variant="form" gap="control">{fields.map(([key, en, de]) => <Input form={form} key={key} label={copy(en, de)} value={value[key] ?? ''} onChange={event => onChange({ ...value, [key]: event.target.value })} />)}</Grid>
      <TextArea form={form} label={copy('Abstract', 'Zusammenfassung')} help={copy('The source’s own published summary.', 'Die eigene, veröffentlichte Zusammenfassung der Quelle.')} rows={2} value={value.abstract ?? ''} onChange={event => onChange({ ...value, abstract: event.target.value })} />
    </Stack></details>
  </Stack>;
}
