'use client';

import { useId } from 'react';
import type { DocumentCreator } from '../../../lib/document-api';
import { useTranslation } from '../TranslationProvider';
import { Button, Input, Select } from '../ui';
import { Grid, Inline, Stack } from '../layout/Layout';
import styles from './DocumentAttachmentTemplate.module.css';

export const documentCreatorName = (creator: DocumentCreator) => creator.literal || [creator.given, creator.family].filter(Boolean).join(' ');

export function DocumentCreatorFields({ kind, value, onChange, disabled, form }: {
  kind: 'authors' | 'editors'; value: DocumentCreator[]; onChange: (value: DocumentCreator[]) => void; disabled?: boolean; form?: string;
}) {
  const id = useId(), t = useTranslation(), copy = (en: string, de: string) => t({ en, de });
  const title = kind === 'authors' ? copy('Authors', 'Autoren') : copy('Editors', 'Herausgeber');
  function move(index: number, delta: number) {
    const next = [...value]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; onChange(next);
  }
  return <Stack as="fieldset" gap="control" disabled={disabled} className={styles.creatorGroup}>
    <legend>{title}</legend>
    {value.map((creator, index) => {
      const institution = creator.literal !== undefined && creator.literal !== null;
      const update = (next: DocumentCreator) => onChange(value.map((item, i) => i === index ? next : item));
      return <Stack key={index} gap="related" className={styles.creator}>
        <Select form={form} id={`${id}-${index}-kind`} label={`${title} ${index + 1}`} value={institution ? 'institution' : 'person'} onChange={event => update(event.target.value === 'institution' ? { literal: documentCreatorName(creator) } : { family: creator.literal ?? creator.family ?? '', given: creator.given ?? '' })}>
          <option value="person">{copy('Person', 'Person')}</option><option value="institution">{copy('Institution', 'Institution')}</option>
        </Select>
        {institution ? <Input form={form} label={copy('Institution name', 'Name der Institution')} value={creator.literal ?? ''} onChange={event => update({ literal: event.target.value })} /> : <Grid columns={2} gap="control">
          <Input form={form} label={copy('Family name', 'Nachname')} value={creator.family ?? ''} onChange={event => update({ ...creator, family: event.target.value })} />
          <Input form={form} label={copy('Given names', 'Vornamen')} value={creator.given ?? ''} onChange={event => update({ ...creator, given: event.target.value })} />
        </Grid>}
        <Inline gap="related">
          <Button type="button" variant="ghost" disabled={index === 0} aria-label={`${copy('Move up', 'Nach oben')}: ${documentCreatorName(creator) || index + 1}`} onClick={() => move(index, -1)}>↑</Button>
          <Button type="button" variant="ghost" disabled={index === value.length - 1} aria-label={`${copy('Move down', 'Nach unten')}: ${documentCreatorName(creator) || index + 1}`} onClick={() => move(index, 1)}>↓</Button>
          <Button type="button" variant="ghost" onClick={() => onChange(value.filter((_, i) => i !== index))}>{copy('Remove', 'Entfernen')}</Button>
        </Inline>
      </Stack>;
    })}
    <Button type="button" variant="ghost" onClick={() => onChange([...value, { family: '', given: '' }])}>{kind === 'authors' ? copy('Add author', 'Autor hinzufügen') : copy('Add editor', 'Herausgeber hinzufügen')}</Button>
  </Stack>;
}
