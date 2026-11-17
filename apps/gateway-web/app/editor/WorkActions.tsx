'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { workflowUi } from '../../lib/workflow-messages';
import { inboxUi } from '../../lib/editor-inbox-messages';
import { workManagement, type InboxRow } from '../../lib/editor-inbox';
import { useTranslation } from '../components/TranslationProvider';
import { ReaderMenu } from '../components/ReaderMenu';
import { NavigatingActionForm } from '../components/NavigatingActionForm';
import { Button } from '../components/ui';
import { manageWorkAction } from './work-actions';
import styles from './editor-inbox.module.css';
import collection from '../components/layout/WorkCollection.module.css';

export function WorkActions({ row, archived, returnTo, label }: { row: InboxRow; archived: boolean; returnTo: string; label: string }) {
  const t = useTranslation();
  const trigger = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number; origin: HTMLButtonElement } | null>(null), [confirm, setConfirm] = useState(false);
  const management = workManagement(row, archived);
  if (!management && !row.publicHref) return null;
  const actionMessage = management ? managementMessages[management].action : inboxUi.viewConstitution;
  return <>
    <button type="button" ref={trigger} className={collection.iconButton} aria-label={`${t(inboxUi.more)}: ${label}`} aria-haspopup="menu" aria-expanded={Boolean(position)} onClick={() => {
      const bounds = trigger.current!.getBoundingClientRect();
      setPosition(position ? null : { x: bounds.right - 240, y: bounds.bottom + 5, origin: trigger.current! });
    }}><MoreHorizontal size={18} aria-hidden="true" /></button>
    {position ? <ReaderMenu title={t(inboxUi.more)} origin={position.origin} position={position} onClose={restore => { setPosition(null); if (restore) trigger.current?.focus(); }} items={[
      ...(row.publicHref ? [{ id: 'view', label: t(inboxUi.viewConstitution), href: row.publicHref }] : []),
      ...(management ? [{ id: 'manage', label: t(actionMessage), onSelect: () => { setPosition(null); setConfirm(true); } }] : []),
    ]} /> : null}
    {confirm && management ? <WorkConfirmation row={row} label={label} returnTo={returnTo} management={management} close={() => { setConfirm(false); trigger.current?.focus({ preventScroll: true }); }} /> : null}
  </>;
}

const managementMessages = {
  discard: { action: workflowUi.deleteDraft, title: inboxUi.discardTitle, hint: workflowUi.deleteDraftHint, submit: workflowUi.confirmDelete },
  archive: { action: workflowUi.archive, title: inboxUi.archiveTitle, hint: inboxUi.archiveHint, submit: workflowUi.archive },
  restore: { action: workflowUi.restore, title: inboxUi.restoreTitle, hint: inboxUi.restoreHint, submit: workflowUi.restore },
};
function WorkConfirmation({ row, label, returnTo, management, close }: {
  row: InboxRow; label: string; returnTo: string; management: keyof typeof managementMessages; close: () => void;
}) {
  const t = useTranslation(), titleId = useId(), dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const copy = managementMessages[management];
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); close(); }}>
    <h2 id={titleId}>{t(copy.title)}</h2><div className={styles.dialogItem}>{label}</div><p>{t(copy.hint)}</p>
    <NavigatingActionForm action={manageWorkAction}>
      <input type="hidden" name="id" value={row.id} /><input type="hidden" name="kind" value={row.kind === 'import' ? 'import' : 'session'} /><input type="hidden" name="action" value={management} /><input type="hidden" name="returnTo" value={returnTo} />
      <div className={styles.dialogActions}><Button type="button" variant="ghost" onClick={close}>{t(inboxUi.cancel)}</Button><Button variant="primary">{t(copy.submit)}</Button></div>
    </NavigatingActionForm>
  </dialog>;
}
