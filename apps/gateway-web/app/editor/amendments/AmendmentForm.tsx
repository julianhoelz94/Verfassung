'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import type { Amendment, AmendmentDocument, VersionSummary } from '../../../lib/api';
import { Alert, Badge, Button, Input, Select, TextArea } from '../../components/ui';
import { AmendmentChangesTable, type ChangeRow } from './AmendmentChangesTable';
import { saveAmendmentAction, suggestChangesAction, withdrawAmendmentAction } from './actions';

type AmendmentFormProps = {
  amendmentId: string;
  constitutionId: string;
  amendment: Amendment | null;
  versions: VersionSummary[];
  articlesByVersion: Record<string, string[]>;
  latestVersionId?: string | null;
  canSave: boolean;
  canPublish: boolean;
  canWithdraw: boolean;
  readOnly: boolean;
  contentAvailable?: boolean;
};

function initialRows(amendment: Amendment | null): ChangeRow[] {
  if (!amendment?.changes?.length) {
    return [];
  }
  return amendment.changes.map((change) => ({
    articleNumber: change.articleNumber ?? '',
    changeType: change.changeType,
    note: change.note ?? '',
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
  latestVersionId,
  canSave,
  canPublish,
  canWithdraw,
  readOnly,
  contentAvailable = true,
}: AmendmentFormProps) {
  const [targetVersionId, setTargetVersionId] = useState(amendment?.targetVersionId ?? latestVersionId ?? '');
  const [changeRows, setChangeRows] = useState<ChangeRow[]>(() => initialRows(amendment));
  const [documents, setDocuments] = useState<AmendmentDocument[]>(() => amendment?.documents?.length ? amendment.documents : [{ url: '', fileId: '', label: '' }]);
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
      setSuggestError('Choose both source and target versions.');
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
      }));
      setChangeRows((current) => mergeSuggestedRows(current, suggested));
      closeSuggestDialog();
    });
  }

  return (
    <form action={saveAmendmentAction} className="stack">
      <input type="hidden" name="amendmentId" value={amendmentId} />
      <input type="hidden" name="constitutionId" value={constitutionId} />
      {amendment?.status ? (
        <p>
          Status:{' '}
          <Badge
            tone={
              amendment.status === 'published' ? 'added' : amendment.status === 'withdrawn' ? 'removed' : 'changed'
            }
          >
            {amendment.status}
          </Badge>
        </p>
      ) : null}
      <Input
        id="amendment-title"
        name="title"
        label="Title"
        defaultValue={amendment?.title ?? ''}
        required
        disabled={readOnly}
      />
      <Input
        id="amendment-citation"
        name="sourceReference"
        label="Citation"
        defaultValue={amendment?.sourceReference ?? ''}
        disabled={readOnly}
      />
      <div className="form-row">
        <Input
          id="amendment-enacted"
          name="enactedOn"
          label="Enacted date"
          type="date"
          defaultValue={amendment?.enactedOn ?? ''}
          disabled={readOnly}
        />
        <Input
          id="amendment-effective"
          name="effectiveOn"
          label="Effective date"
          type="date"
          defaultValue={amendment?.effectiveOn ?? ''}
          disabled={readOnly}
        />
      </div>
      <TextArea
        id="amendment-summary"
        name="summary"
        label="Summary"
        defaultValue={amendment?.summary ?? ''}
        disabled={readOnly}
      />
      <TextArea id="amendment-comment" name="comment" label="Comment" defaultValue={amendment?.comment ?? ''} required disabled={readOnly} rows={4} />
      <input type="hidden" name="documentsJson" value={JSON.stringify(documents)} />
      <fieldset className="stack">
        <legend>Documents</legend>
        {documents.map((document, index) => (
          <div className="form-row" key={index}>
            <Input id={`amendment-document-url-${index}`} label="Document URL" value={document.url ?? ''} type="url" disabled={readOnly} onChange={(event) => setDocuments((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, url: event.target.value } : row))} />
            <Input id={`amendment-document-file-${index}`} label="Archived file ID" value={document.fileId ?? ''} disabled={readOnly} onChange={(event) => setDocuments((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, fileId: event.target.value } : row))} />
            <Input id={`amendment-document-label-${index}`} label="Label" value={document.label ?? ''} disabled={readOnly} onChange={(event) => setDocuments((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, label: event.target.value } : row))} />
            {!readOnly && documents.length > 1 ? <Button type="button" onClick={() => setDocuments((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}>Remove</Button> : null}
          </div>
        ))}
        {!readOnly ? <Button type="button" onClick={() => setDocuments((rows) => [...rows, { url: '', fileId: '', label: '' }])}>Add document</Button> : null}
      </fieldset>
      <div className="form-row">
        <Select
          id="amendment-source-version"
          name="sourceVersionId"
          label="Source version (optional)"
          defaultValue={amendment?.sourceVersionId ?? ''}
          disabled={readOnly}
        >
          <option value="">None</option>
          {versions.map((version) => (
            <option key={version.id} value={version.id}>
              {versionLabel(version)}
            </option>
          ))}
        </Select>
        <Select
          id="amendment-target-version"
          name="targetVersionId"
          label="Target version (optional)"
          value={targetVersionId}
          disabled={readOnly}
          onChange={(event) => setTargetVersionId(event.target.value)}
        >
          <option value="">None</option>
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
              Fill from two versions
            </Button>
          </div>
        ) : (
          <Alert tone="error">Content service is unavailable. Fill from two versions is disabled.</Alert>
        )
      ) : null}
      <AmendmentChangesTable
        initialRows={changeRows}
        articleNumbers={articleNumbers}
        readOnly={readOnly}
        onRowsChange={setChangeRows}
      />
      <div className="action-bar">
        {canSave ? (
          <Button variant="primary" formAction={saveAmendmentAction}>
            Save draft
          </Button>
        ) : null}
        {canWithdraw && amendmentId !== 'new' ? (
          <Button formAction={withdrawAmendmentAction}>Withdraw</Button>
        ) : null}
      </div>
      <dialog ref={suggestDialogRef} className="dialog">
        <form method="dialog" className="stack">
          <h2 className="section-title">Fill from two versions</h2>
          <p className="muted">Compare two snapshots and merge suggested changes into the table below. Nothing is saved until you save the draft.</p>
          <Select
            id="suggest-source-version"
            name="suggestSourceVersion"
            label="Source version"
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
            label="Target version"
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
              Cancel
            </Button>
            <Button type="button" variant="primary" disabled={pending} onClick={handleSuggest}>
              {pending ? 'Suggesting…' : 'Suggest changes'}
            </Button>
          </div>
        </form>
      </dialog>
    </form>
  );
}
