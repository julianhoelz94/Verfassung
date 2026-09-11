'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import type { Amendment, VersionSummary } from '../../../lib/api';
import { Alert, Badge, Button, Input, Select, TextArea } from '../../components/ui';
import { AmendmentChangesTable, type ChangeRow } from './AmendmentChangesTable';
import { publishAmendmentAction, saveAmendmentAction, suggestChangesAction, withdrawAmendmentAction } from './actions';

const KIND_OPTIONS = [
  { value: 'legal_amendment', label: 'Legal amendment' },
  { value: 'official_errata', label: 'Official errata' },
] as const;

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
      <Select id="amendment-kind" name="kind" label="Kind" defaultValue={amendment?.kind ?? 'legal_amendment'} disabled={readOnly}>
        {KIND_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
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
        {canPublish && amendmentId !== 'new' ? (
          <Button formAction={publishAmendmentAction}>Publish law</Button>
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
