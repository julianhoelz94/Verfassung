'use client';

import { changeTypeMessage } from '../../../lib/ui-labels';

import { T, useTranslation } from '../../components/TranslationProvider';
import { ui } from '../../../lib/messages';
import { statusMessage } from '../../../lib/ui-labels';
import { useMemo, useRef, useState, useTransition } from 'react';
import type { Amendment, AmendmentDocument, ArticleSummary, VersionSummary } from '../../../lib/api';
import { Alert, Badge, Button, Input, Select, TextArea } from '../../components/ui';
import { AmendmentChangesTable, type ChangeRow } from './AmendmentChangesTable';
import { suggestChangesAction } from './actions';
import type { DiffReviewState, ReviewCandidate } from '../../../lib/diff-review';
import { DiffReviewQueue } from '../DiffReviewQueue';

type AmendmentFormProps = {
  amendmentId: string;
  constitutionId: string;
  amendment: Amendment | null;
  versions: VersionSummary[];
  articlesByVersion: Record<string, string[]>;
  unitTreesByVersion: Record<string, ArticleSummary[]>;
  latestVersionId?: string | null;
  canSave: boolean;
  canPublish: boolean;
  canWithdraw: boolean;
  readOnly: boolean;
  contentAvailable?: boolean;
  diffReview?: DiffReviewState | null;
  canReviewDiff?: boolean;
  canAcknowledgeDiff?: boolean;
};

function initialRows(amendment: Amendment | null): ChangeRow[] {
  if (!amendment?.changes?.length) {
    return [];
  }
  return amendment.changes.map((change) => ({
    articleNumber: change.articleNumber ?? '',
    changeType: change.changeType,
    note: change.note ?? '',
    beforeRef: change.beforeRef ?? null,
    afterRef: change.afterRef ?? null,
    linkReviewReason: change.linkReviewReason ?? '',
    legacyLinkUnresolved: change.legacyLinkUnresolved ?? false,
  }));
}

function versionLabel(version: VersionSummary): string {
  const listing = version.listing === 'staff' ? ' (staff)' : '';
  return `${version.versionLabel}${listing}`;
}

function mergeSuggestedRows(current: ChangeRow[], suggested: ChangeRow[]): ChangeRow[] {
  const kept = current.filter((row) => row.articleNumber.trim() || row.note.trim());
  if (suggested.length === 0) {
    return kept.length > 0 ? kept : [{ articleNumber: '', changeType: 'changed', note: '' }];
  }
  return kept.length > 0 ? [...kept, ...suggested] : suggested;
}

export function AmendmentForm({
  amendmentId,
  constitutionId,
  amendment,
  versions,
  articlesByVersion,
  unitTreesByVersion,
  latestVersionId,
  canSave,
  canPublish,
  canWithdraw,
  readOnly,
  contentAvailable = true,
  diffReview,
  canReviewDiff = false,
  canAcknowledgeDiff = false,
}: AmendmentFormProps) {
  const t = useTranslation();
  const [sourceVersionId, setSourceVersionId] = useState(amendment?.sourceVersionId ?? versions[0]?.id ?? '');
  const [targetVersionId, setTargetVersionId] = useState(amendment?.targetVersionId ?? latestVersionId ?? '');
  const [changeRows, setChangeRows] = useState<ChangeRow[]>(() => initialRows(amendment));
  const documents: AmendmentDocument[] = amendment?.documents ?? [];
  const [suggestSourceId, setSuggestSourceId] = useState(versions[0]?.id ?? '');
  const [suggestTargetId, setSuggestTargetId] = useState(versions[1]?.id ?? versions[0]?.id ?? '');
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const suggestDialogRef = useRef<HTMLDialogElement>(null);

  const articleNumbers = useMemo(() => {
    const versionId = targetVersionId || latestVersionId || versions[0]?.id;
    return versionId ? (articlesByVersion[versionId] ?? []) : [];
  }, [articlesByVersion, latestVersionId, targetVersionId, versions]);

  function openSuggestDialog() {
    setSuggestError(null);
    suggestDialogRef.current?.showModal();
  }

  function closeSuggestDialog() {
    suggestDialogRef.current?.close();
  }

  function handleSuggest() {
    if (!suggestSourceId || !suggestTargetId) {
      setSuggestError(t(ui.remainingStatus.chooseSourceTarget));
      return;
    }
    startTransition(async () => {
      const result = await suggestChangesAction(suggestSourceId, suggestTargetId);
      if ('error' in result) {
        setSuggestError(result.error);
        return;
      }
      const suggested: ChangeRow[] = result.changes.map((change) => ({
        articleNumber: change.articleNumber ?? '',
        changeType: change.changeType,
        note: change.note ?? '',
        beforeRef: change.beforeRef ?? null,
        afterRef: change.afterRef ?? null,
        linkReviewReason: '',
      }));
      setSourceVersionId(suggestSourceId);
      setTargetVersionId(suggestTargetId);
      setChangeRows((current) => mergeSuggestedRows(current, suggested));
      closeSuggestDialog();
    });
  }

  function addCandidateRow(candidate: ReviewCandidate) {
    const before = candidate.beforeRefs[0];
    const after = candidate.afterRefs[0];
    const path = after?.path ?? before?.path ?? [];
    const articleNumber = path[0]?.match(/\d+[a-zA-Z]?/)?.[0] ?? '';
    setChangeRows((current) => [...current, {
      articleNumber,
      changeType: !before ? 'added' : !after ? 'removed' : 'changed',
      note: '',
      beforeRef: before ? { versionId: before.versionId, logicalId: before.logicalId, occurrenceId: before.occurrenceId, revisionId: before.revisionId, unitKind: before.kind === 'text_entry' ? 'text_entry' : 'node' } : null,
      afterRef: after ? { versionId: after.versionId, logicalId: after.logicalId, occurrenceId: after.occurrenceId, revisionId: after.revisionId, unitKind: after.kind === 'text_entry' ? 'text_entry' : 'node' } : null,
    }]);
  }

  return (
    <form action="/editor/command" method="post" className="stack">
      <input type="hidden" name="command" value="amendment-save" />
      <input type="hidden" name="amendmentId" value={amendmentId} />
      <input type="hidden" name="constitutionId" value={constitutionId} />
      {amendment?.status ? (
        <p>
          <T value={ui.editor.amendments.amendmentform.status} />{' '}
          <Badge
            tone={
              amendment.status === 'published' ? 'added' : amendment.status === 'withdrawn' ? 'removed' : 'changed'
            }
          >
            <T value={statusMessage(amendment.status)} />
          </Badge>
        </p>
      ) : null}
      <Input
        id="amendment-title"
        name="title"
        label={<T value={ui.attrs.editorAmendmentsAmendmentformInputLabelTitle} />}
        defaultValue={amendment?.title ?? ''}
        required
        disabled={readOnly}
      />
      <Input
        id="amendment-citation"
        name="sourceReference"
        label={<T value={ui.attrs.editorAmendmentsAmendmentformInputLabelCitation} />}
        defaultValue={amendment?.sourceReference ?? ''}
        disabled={readOnly}
      />
      <div className="form-row">
        <Input
          id="amendment-enacted"
          name="enactedOn"
          label={<T value={ui.attrs.editorAmendmentsAmendmentformInputLabelEnacted} />}
          type="date"
          defaultValue={amendment?.enactedOn ?? ''}
          disabled={readOnly}
        />
        <Input
          id="amendment-effective"
          name="effectiveOn"
          label={<T value={ui.attrs.editorAmendmentsAmendmentformInputLabelEffective} />}
          type="date"
          defaultValue={amendment?.effectiveOn ?? ''}
          disabled={readOnly}
        />
      </div>
      <TextArea
        id="amendment-summary"
        name="summary"
        label={<T value={ui.attrs.editorAmendmentsAmendmentformTextAreaLabelSummary} />}
        defaultValue={amendment?.summary ?? ''}
        disabled={readOnly}
      />
      <TextArea id="amendment-comment" name="comment" label={<T value={ui.attrs.editorAmendmentsAmendmentformTextAreaLabelComment} />} defaultValue={amendment?.comment ?? ''} required disabled={readOnly} rows={4} />
      <input type="hidden" name="documentsJson" value={JSON.stringify(documents)} />
      <fieldset className="stack">
        <legend><T value={ui.editor.amendments.amendmentform.documents} /></legend>
        <p><T value={ui.editor.amendments.amendmentform.saveTheLegalChangeThenAttachA} /></p>
        {documents.length ? <ul className="link-list">{documents.map((document, index) => <li key={index}>
          {document.url ? <a href={document.url} rel="noreferrer">{document.label || document.url}</a> : document.label || document.fileId || 'Archived document'}
        </li>)}</ul> : null}
      </fieldset>
      <div className="form-row">
        <Select
          id="amendment-source-version"
          name="sourceVersionId"
          label={<T value={ui.attrs.editorAmendmentsAmendmentformSelectLabelSource} />}
          value={sourceVersionId}
          disabled={readOnly}
          onChange={(event) => setSourceVersionId(event.target.value)}
        >
          <option value=""><T value={ui.editor.amendments.amendmentform.none} /></option>
          {versions.map((version) => (
            <option key={version.id} value={version.id}>
              {versionLabel(version)}
            </option>
          ))}
        </Select>
        <Select
          id="amendment-target-version"
          name="targetVersionId"
          label={<T value={ui.attrs.editorAmendmentsAmendmentformSelectLabelTarget} />}
          value={targetVersionId}
          disabled={readOnly}
          onChange={(event) => setTargetVersionId(event.target.value)}
        >
          <option value=""><T value={ui.editor.amendments.amendmentform.none} /></option>
          {versions.map((version) => (
            <option key={version.id} value={version.id}>
              {versionLabel(version)}
            </option>
          ))}
        </Select>
      </div>
      {!readOnly ? (
        contentAvailable ? (
          <div className="action-bar">
            <Button type="button" onClick={openSuggestDialog}>
              <T value={ui.editor.amendments.amendmentform.fillFromTwoVersions} />{" "}</Button>
          </div>
        ) : (
          <Alert tone="error"><T value={ui.editor.amendments.amendmentform.contentServiceIsUnavailableFillFromTwo} /></Alert>
        )
      ) : null}
      <div className={diffReview ? 'amendment-review-layout' : undefined}>
        <AmendmentChangesTable
          initialRows={changeRows}
          articleNumbers={articleNumbers}
          unitTreesByVersion={unitTreesByVersion}
          sourceVersionId={sourceVersionId}
          targetVersionId={targetVersionId}
          readOnly={readOnly}
          onRowsChange={setChangeRows}
        />
        {diffReview ? <DiffReviewQueue key={diffReview.revisionId} target={{ kind: 'amendment', id: amendmentId }} initial={diffReview}
          rows={(amendment?.changes ?? []).map((change, index) => ({ id: change.id, label: `${index + 1}. ${t(changeTypeMessage(change.changeType))} ${change.articleNumber ?? ''} ${change.note ?? ''}`.trim() }))}
          canDecide={canReviewDiff && !readOnly || canAcknowledgeDiff} canAcknowledge={canAcknowledgeDiff}
          onAddRow={!readOnly ? addCandidateRow : undefined} /> : null}
      </div>
      <div className="action-bar">
        {canSave ? (
          <Button variant="primary" type="submit">
            <T value={ui.editor.amendments.amendmentform.saveDraft} />{" "}</Button>
        ) : null}
        {canWithdraw && amendmentId !== 'new' ? (
          <Button formAction="/editor/command?command=amendment-withdraw" formMethod="post"><T value={ui.editor.amendments.amendmentform.withdraw} /></Button>
        ) : null}
      </div>
      <dialog ref={suggestDialogRef} className="dialog">
        <div className="stack">
          <h2 className="section-title"><T value={ui.editor.amendments.amendmentform.fillFromTwoVersions} /></h2>
          <p className="muted"><T value={ui.editor.amendments.amendmentform.compareTwoSnapshotsAndMergeSuggestedChanges} /></p>
          <Select
            id="suggest-source-version"
            name="suggestSourceVersion"
            label={<T value={ui.attrs.editorAmendmentsAmendmentformSelectLabelSource2} />}
            value={suggestSourceId}
            onChange={(event) => setSuggestSourceId(event.target.value)}
          >
            {versions.map((version) => (
              <option key={version.id} value={version.id}>
                {versionLabel(version)}
              </option>
            ))}
          </Select>
          <Select
            id="suggest-target-version"
            name="suggestTargetVersion"
            label={<T value={ui.attrs.editorAmendmentsAmendmentformSelectLabelTarget2} />}
            value={suggestTargetId}
            onChange={(event) => setSuggestTargetId(event.target.value)}
          >
            {versions.map((version) => (
              <option key={version.id} value={version.id}>
                {versionLabel(version)}
              </option>
            ))}
          </Select>
          {suggestError ? <Alert tone="error">{suggestError}</Alert> : null}
          <div className="action-bar">
            <Button type="button" onClick={closeSuggestDialog}>
              <T value={ui.editor.amendments.amendmentform.cancel} />{" "}</Button>
            <Button type="button" variant="primary" disabled={pending} onClick={handleSuggest}>
              <T value={pending ? ui.remainingStatus.suggesting : ui.remainingStatus.suggestChanges} />
            </Button>
          </div>
        </div>
      </dialog>
    </form>
  );
}
