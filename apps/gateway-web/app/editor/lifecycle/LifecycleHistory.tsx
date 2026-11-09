'use client';

import { useState, type ReactNode } from 'react';
import type { ConstitutionLifecycleEvent } from '../../../lib/api';
import type { LifecycleEntry, LifecycleScope } from '../../../lib/lifecycle-workspace';
import { lifecycleDate, lifecycleEventLabels } from '../../../lib/lifecycle-workspace';
import { lifecycleWorkspaceUi as copy } from '../../../lib/lifecycle-workspace-messages';
import { useLocale, useTranslation } from '../../components/TranslationProvider';
import { Button, Input, Select, TextArea } from '../../components/ui';
import { Inline, Stack } from '../../components/layout/Layout';
import { StagedRecordForm } from './StagedRecordForm';
import { reviseLifecycleEvidenceAction } from './actions';
import styles from './LifecycleWorkspace.module.css';

export function LifecycleHistory({ entries, materials, constitutionId, code, returnTo, initialEventId }: { entries: LifecycleEntry[]; materials: Record<string, ReactNode>; constitutionId: string; code: string; returnTo: string; initialEventId?: string }) {
  const t = useTranslation(), locale = useLocale();
  const [filter, setFilter] = useState<'all' | LifecycleScope>('all');
  const [editing, setEditing] = useState(initialEventId ?? '');
  const visible = entries.some(event => filter === 'all' || event.scope === filter);
  return <Stack gap="card"><div className={styles.heading}><h2>{t(copy.eventHistory)}</h2><Select name="historyFilter" label={t(copy.history)} value={filter} onChange={event => setFilter(event.target.value as typeof filter)}><option value="all">{t(copy.allEvents)}</option><option value="whole">{t(copy.whole)}</option><option value="passages">{t(copy.passages)}</option></Select></div>
    <ol className={styles.historyList}>{entries.map(event => <li hidden={filter !== 'all' && event.scope !== filter} key={event.id} className={styles.historyCard}>
      <div className={styles.heading}><time dateTime={event.eventDate}>{lifecycleDate(event.eventDate, locale, 'dateCertainty' in event && event.dateCertainty === 'approximate')}</time><span className={styles.badge}>{t(event.scope === 'whole' ? copy.whole : copy.passages)}{'logicalUnitIds' in event ? ` · ${event.logicalUnitIds.length}` : ''}</span></div>
      <h3>{t(lifecycleEventLabels[event.eventType])}</h3>{event.note ? <p>{event.note}</p> : null}
      {event.sourceUrl ? <p className={styles.muted}>{t(copy.legacySource)}: <a href={event.sourceUrl} target="_blank" rel="noreferrer">{event.sourceUrl}</a></p> : null}
      <details><summary>{t(copy.documents)}</summary><div className={styles.materials}>{materials[event.id]}</div></details>
      {event.scope === 'whole' ? <><Button type="button" variant="ghost" aria-expanded={editing === event.id} onClick={() => setEditing(editing === event.id ? '' : event.id)}>{t(copy.editEvidence)}</Button>
        <div hidden={editing !== event.id}><EvidenceEditor event={event as ConstitutionLifecycleEvent} constitutionId={constitutionId} code={code} returnTo={returnTo} /></div></> : null}
    </li>)}</ol>{!visible ? <p className={styles.muted}>{t(copy.noEvents)}</p> : null}
  </Stack>;
}

function EvidenceEditor({ event, constitutionId, code, returnTo }: { event: ConstitutionLifecycleEvent; constitutionId: string; code: string; returnTo: string }) {
  const t = useTranslation();
  return <StagedRecordForm action={reviseLifecycleEvidenceAction} className={styles.evidenceEditor}>
    <input type="hidden" name="constitutionId" value={constitutionId} /><input type="hidden" name="code" value={code} /><input type="hidden" name="eventId" value={event.id} /><input type="hidden" name="expectedRevisionId" value={event.evidenceRevisionId ?? ''} /><input type="hidden" name="returnTo" value={returnTo} />
    {event.sourceUrl ? <details><summary>{t(copy.legacySource)}</summary><Input name="sourceUrl" id={`evidence-source-${event.id}`} label={t(copy.legacySource)} type="url" maxLength={2048} defaultValue={event.sourceUrl} /></details> : <input type="hidden" name="sourceUrl" value="" />}
    <p className={styles.muted}>{t(copy.fixedEvent)}</p>
    <TextArea name="note" id={`evidence-note-${event.id}`} label={t(copy.note)} defaultValue={event.note ?? ''} maxLength={10000} rows={3} info={{ description: t(copy.noteHelp), changeability: 'later' }} />
    <Inline><Button type="submit" variant="primary">{t(copy.saveEvidence)}</Button></Inline>
  </StagedRecordForm>;
}
