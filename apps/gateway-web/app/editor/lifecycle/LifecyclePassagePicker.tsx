'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { LifecycleUnit } from '../../../lib/lifecycle-workspace';
import { lifecycleWorkspaceUi as copy } from '../../../lib/lifecycle-workspace-messages';
import { useTranslation } from '../../components/TranslationProvider';
import { Button, Input } from '../../components/ui';
import { Inline, Stack } from '../../components/layout/Layout';
import styles from './LifecycleWorkspace.module.css';

export function LifecyclePassagePicker({ units, selected, onChange }: { units: LifecycleUnit[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const t = useTranslation(), dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [draft, setDraft] = useState<string[]>([]);
  useEffect(() => { if (open) dialog.current?.showModal(); }, [open]);
  const matches = units.filter(unit => `${unit.path} ${unit.text}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <Stack gap="related">
    <div className={styles.selection}>
      <Inline><span>{selected.length ? `${t(copy.selected)}: ${selected.length}` : t(copy.noneSelected)}</span><Button type="button" variant="ghost" onClick={() => { setDraft([...selected]); setQuery(''); setOpen(true); }}>{t(copy.selectPassages)}</Button></Inline>
      {selected.length ? <ul className={styles.chips}>{selected.map(id => <li key={id}><span>{units.find(unit => unit.id === id)?.path ?? id}</span><Button type="button" size="sm" variant="ghost" aria-label={`${t({ en: 'Remove', de: 'Entfernen' })}: ${units.find(unit => unit.id === id)?.path ?? id}`} onClick={() => onChange(selected.filter(value => value !== id))}>×</Button></li>)}</ul> : null}
    </div>
    {open ? <dialog ref={dialog} className={styles.dialog} aria-labelledby="lifecycle-passage-title" onCancel={() => setOpen(false)}>
      <div className={styles.dialogHeading}><h2 id="lifecycle-passage-title">{t(copy.selectPassages)}</h2><Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t(copy.close)}</Button></div>
      <Stack className={styles.dialogBody} gap="field">
        <Input autoFocus type="search" label={t(copy.searchPassages)} value={query} onChange={event => setQuery(event.target.value)} />
        <p className={styles.muted}>{t(copy.exactSelection)}</p>
        <ul className={styles.unitList}>{matches.map(unit => <li key={unit.id} style={{ '--unit-depth': Math.min(unit.depth, 3) } as CSSProperties}>
          <label><input type="checkbox" checked={draft.includes(unit.id)} onChange={event => setDraft(values => event.target.checked ? [...values, unit.id] : values.filter(id => id !== unit.id))} /><span>{unit.label}<small>{unit.path}</small></span></label>
        </li>)}</ul>
        {!matches.length ? <p>{t(copy.noMatches)}</p> : null}
      </Stack>
      <div className={styles.dialogActions}><span className={styles.muted} aria-live="polite">{draft.length} {t(copy.selected)}</span><Inline><Button type="button" onClick={() => setOpen(false)}>{t(copy.cancel)}</Button><Button type="button" variant="primary" onClick={() => { onChange(draft); setOpen(false); }}>{t(copy.useSelection)}</Button></Inline></div>
    </dialog> : null}
  </Stack>;
}
