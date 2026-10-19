'use client';

import { T, useTranslation } from '../../components/TranslationProvider';
import { ui } from '../../../lib/messages';
import { useMemo, useState } from 'react';
import type { Amendment } from '../../../lib/api';
import type { AmendmentRevision } from '../../../lib/amendment-editor-api';
import { Badge, Button } from '../../components/ui';
import { FormattedDate } from '../../../lib/format-date';
import { restoreRevisionAction } from './actions';

type AmendmentRevisionPanelProps = {
  amendmentId: string;
  amendment: Amendment;
  revisions: AmendmentRevision[];
  selectedRevisionId: string | null;
  onSelectRevision: (revisionId: string | null) => void;
  canRestore: boolean;
};

function actorLabel(createdBy: string | null | undefined): string {
  if (!createdBy) {
    return '';
  }
  return createdBy.slice(0, 8);
}

export function AmendmentRevisionPanel({
  amendmentId,
  amendment,
  revisions,
  selectedRevisionId,
  onSelectRevision,
  canRestore,
}: AmendmentRevisionPanelProps) {
  const t = useTranslation();
  const [restoring, setRestoring] = useState(false);
  const ordered = useMemo(
    () =>
      [...revisions].sort((a, b) => {
        const dateCmp = a.createdAt.localeCompare(b.createdAt);
        if (dateCmp !== 0) {
          return dateCmp;
        }
        return a.id.localeCompare(b.id);
      }),
    [revisions],
  );
  const newestId = ordered.at(-1)?.id ?? null;
  const selectedRevision =
    selectedRevisionId === null ? null : ordered.find((revision) => revision.id === selectedRevisionId) ?? null;
  const viewingPast = selectedRevisionId !== null;

  const list = (
    <ol className="stack revision-list">
      {ordered.map((revision) => {
        const isNewest = revision.id === newestId;
        const isActive = selectedRevisionId === null ? isNewest : selectedRevisionId === revision.id;
        const isPublic = Boolean(amendment.publishedRevisionId) && revision.id === amendment.publishedRevisionId;
        return (
          <li key={revision.id}>
            <button
              type="button"
              className={['revision-item', isActive ? 'revision-item-active' : undefined].filter(Boolean).join(' ')}
              onClick={() => onSelectRevision(isNewest ? null : revision.id)}
            >
              <span className="revision-date">
                <FormattedDate value={revision.createdAt} />
              </span>
              <span className="revision-actor">{actorLabel(revision.createdBy) || <T value={ui.remainingStatus.unknown} />}</span>
              <Badge tone={isPublic ? 'added' : 'changed'}><T value={isPublic ? ui.remainingStatus.thisIsPublic : ui.remainingStatus.draft} /></Badge>
            </button>
          </li>
        );
      })}
    </ol>
  );

  const restoreForm =
    canRestore && viewingPast && selectedRevision ? (
      <form onSubmit={async event => {
        event.preventDefault();
        if (restoring) return;
        setRestoring(true);
        try {
          window.location.assign(await restoreRevisionAction(new FormData(event.currentTarget)));
        } catch {
          window.location.assign(`/editor/amendments/${encodeURIComponent(amendmentId)}?error=save_failed`);
        }
      }} className="stack">
        <input type="hidden" name="amendmentId" value={amendmentId} />
        <input type="hidden" name="revisionBody" value={JSON.stringify(selectedRevision)} />
        <Button type="submit" size="sm" disabled={restoring}>
          <T value={ui.editor.amendments.amendmentrevisionpanel.restoreAsNewDraft} />{" "}</Button>
      </form>
    ) : null;

  return (
    <>
      <details className="panel panel-side revision-panel-phone">
        <summary className="panel-title"><T value={ui.editor.amendments.amendmentrevisionpanel.revisionHistory} /></summary>
        {list}
        {restoreForm}
      </details>
      <aside className="panel panel-side revision-panel-desktop" aria-label={t(ui.accessibility.revisionHistory)}>
        <p className="panel-title"><T value={ui.editor.amendments.amendmentrevisionpanel.revisionHistory} /></p>
        {list}
        {restoreForm}
      </aside>
    </>
  );
}
