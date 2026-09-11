'use client';

import { useMemo, useState } from 'react';
import type { Amendment, VersionSummary } from '../../../lib/api';
import type { AmendmentRevision } from '../../../lib/amendment-editor-api';
import { Alert } from '../../components/ui';
import { AmendmentForm } from './AmendmentForm';
import { AmendmentRevisionPanel } from './AmendmentRevisionPanel';

type AmendmentEditorLayoutProps = {
  amendmentId: string;
  constitutionId: string;
  amendment: Amendment;
  revisions: AmendmentRevision[] | null;
  versions: VersionSummary[];
  articlesByVersion: Record<string, string[]>;
  latestVersionId?: string | null;
  canSave: boolean;
  canPublish: boolean;
  canWithdraw: boolean;
  readOnly: boolean;
  canRestore: boolean;
  contentAvailable: boolean;
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
    kind: revision.kind ?? base.kind,
    changes: revision.changes.map((change, index) => ({
      id: `revision-${index}`,
      articleId: null,
      articleNumber: change.articleNumber ?? null,
      changeType: change.changeType,
      note: change.note ?? null,
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
  latestVersionId,
  canSave,
  canPublish,
  canWithdraw,
  readOnly,
  canRestore,
  contentAvailable,
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
          latestVersionId={latestVersionId}
          canSave={canSave && !viewingPast}
          canPublish={canPublish && !viewingPast}
          canWithdraw={canWithdraw && !viewingPast}
          readOnly={readOnly || viewingPast}
          contentAvailable={contentAvailable}
        />
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
