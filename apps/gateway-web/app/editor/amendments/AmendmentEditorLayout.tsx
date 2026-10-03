'use client';

import { useMemo, useState } from 'react';
import type { Amendment, ArticleSummary, VersionSummary } from '../../../lib/api';
import type { AmendmentRevision } from '../../../lib/amendment-editor-api';
import type { DiffReviewState } from '../../../lib/diff-review';
import { Alert, Button } from '../../components/ui';
import { AmendmentForm } from './AmendmentForm';
import { AmendmentRevisionPanel } from './AmendmentRevisionPanel';

type AmendmentEditorLayoutProps = {
  amendmentId: string;
  constitutionId: string;
  amendment: Amendment;
  revisions: AmendmentRevision[] | null;
  versions: VersionSummary[];
  articlesByVersion: Record<string, string[]>;
  unitTreesByVersion: Record<string, ArticleSummary[]>;
  latestVersionId?: string | null;
  canSave: boolean;
  canPublish: boolean;
  canWithdraw: boolean;
  readOnly: boolean;
  canRestore: boolean;
  contentAvailable: boolean;
  diffReview?: DiffReviewState | null;
  canReviewDiff?: boolean;
  canAcknowledgeDiff?: boolean;
};

function revisionToAmendment(revision: AmendmentRevision, base: Amendment): Amendment {
  return {
    ...base,
    title: revision.title,
    summary: revision.summary ?? '',
    enactedOn: revision.enactedOn ?? null,
    effectiveOn: revision.effectiveOn ?? null,
    sourceReference: revision.sourceReference ?? null,
    sourceVersionId: revision.sourceVersionId ?? null,
    targetVersionId: revision.targetVersionId ?? null,
    comment: revision.comment ?? base.comment ?? null,
    documents: revision.documents ?? base.documents ?? [],
    changes: revision.changes.map((change, index) => ({
      id: `revision-${index}`,
      articleId: null,
      articleNumber: change.articleNumber ?? null,
      changeType: change.changeType,
      note: change.note ?? null,
      beforeRef: change.beforeRef ?? null,
      afterRef: change.afterRef ?? null,
      linkReviewReason: change.linkReviewReason ?? null,
      legacyLinkUnresolved: change.legacyLinkUnresolved ?? false,
    })),
  };
}

export function AmendmentEditorLayout({
  amendmentId,
  constitutionId,
  amendment,
  revisions,
  versions,
  articlesByVersion,
  unitTreesByVersion,
  latestVersionId,
  canSave,
  canPublish,
  canWithdraw,
  readOnly,
  canRestore,
  contentAvailable,
  diffReview,
  canReviewDiff,
  canAcknowledgeDiff,
}: AmendmentEditorLayoutProps) {
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);

  const orderedRevisions = useMemo(
    () =>
      revisions
        ? [...revisions].sort((a, b) => {
            const dateCmp = a.createdAt.localeCompare(b.createdAt);
            if (dateCmp !== 0) {
              return dateCmp;
            }
            return a.id.localeCompare(b.id);
          })
        : [],
    [revisions],
  );

  const selectedRevision =
    selectedRevisionId === null
      ? null
      : orderedRevisions.find((revision) => revision.id === selectedRevisionId) ?? null;
  const viewingPast = selectedRevision !== null;
  const displayAmendment =
    selectedRevision !== null ? revisionToAmendment(selectedRevision, amendment) : amendment;

  return (
    <div className="workspace amendment-workspace">
      <section className="panel amendment-main">
        {viewingPast ? (
          <Alert tone="info">Viewing a past revision read-only. Restore to edit, or return to the current draft.</Alert>
        ) : null}
        <AmendmentForm
          key={selectedRevision?.id ?? 'current'}
          amendmentId={amendmentId}
          constitutionId={constitutionId}
          amendment={displayAmendment}
          versions={versions}
          articlesByVersion={articlesByVersion}
          unitTreesByVersion={unitTreesByVersion}
          latestVersionId={latestVersionId}
          canSave={canSave && !viewingPast}
          canPublish={canPublish && !viewingPast}
          canWithdraw={canWithdraw && !viewingPast}
          readOnly={readOnly || viewingPast}
          contentAvailable={contentAvailable}
          diffReview={!viewingPast ? diffReview : null}
          canReviewDiff={canReviewDiff}
          canAcknowledgeDiff={canAcknowledgeDiff}
        />
        {canPublish && !viewingPast ? (
          <form action="/editor/command" method="post" className="action-bar"><input type="hidden" name="command" value="amendment-publish" />
            <input type="hidden" name="amendmentId" value={amendmentId} />
            <Button>Publish law</Button>
          </form>
        ) : null}
      </section>
      {revisions && revisions.length > 0 ? (
        <AmendmentRevisionPanel
          amendmentId={amendmentId}
          amendment={amendment}
          revisions={orderedRevisions}
          selectedRevisionId={selectedRevisionId}
          onSelectRevision={setSelectedRevisionId}
          canRestore={canRestore}
        />
      ) : null}
    </div>
  );
}
