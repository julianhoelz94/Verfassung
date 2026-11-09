"use client";

import { useRef, useState } from "react";
import { NavigatingActionForm } from "../components/NavigatingActionForm";
import { Button, TextArea } from "../components/ui";
import { useTranslation } from "../components/TranslationProvider";
import { importReviewUi as copy } from "../../lib/import-review-messages";
import { ui } from "../../lib/messages";
import { transitionImportAction } from "../admin/import/actions";
import styles from "./ImportReviewWorkspace.module.css";
import { useHydrated } from "../../lib/use-hydrated";

export function ImportDecisionForm({
  actorId,
  jobId,
  runId,
  itemId,
  canApprove,
  canReject,
}: {
  actorId: string;
  jobId: string;
  runId?: string;
  itemId?: string;
  canApprove: boolean;
  canReject: boolean;
}) {
  const t = useTranslation(),
    [reason, setReason] = useState<string | null>(null),
    hydrated = useHydrated();
  const key = `atlas-import-review-reason:${actorId}:${jobId}`;
  const confirmation = useRef<HTMLDialogElement>(null);
  const value = reason ?? (hydrated ? readReason(key) : "");
  return (
    <NavigatingActionForm
      action={transitionImportAction}
      className={styles.decision}
    >
      <input type="hidden" name="jobId" value={jobId} />
      {runId ? <input type="hidden" name="runId" value={runId} /> : null}
      {itemId ? <input type="hidden" name="itemId" value={itemId} /> : null}
      <TextArea
        label={t(copy.reason)}
        name="reason"
        id={`import-reason-${jobId}`}
        help={t(copy.reasonHelp)}
        value={value}
        onChange={(event) => {
          setReason(event.target.value);
          try {
            sessionStorage.setItem(key, event.target.value);
          } catch {
            /* Keep the mounted form usable. */
          }
        }}
        minLength={10}
        maxLength={2000}
        required
        rows={4}
      />
      <div className="button-row">
        <Button
          name="action"
          value="approve"
          variant="primary"
          disabled={!canApprove}
        >
          {t(ui.importActions.approveDraft)}
        </Button>
        <Button
          type="button"
          disabled={!canReject}
          onClick={() => {
            const input = document.getElementById(
              `import-reason-${jobId}`,
            ) as HTMLTextAreaElement | null;
            if (input?.reportValidity()) confirmation.current?.showModal();
          }}
        >
          {t(ui.importActions.rejectImport)}
        </Button>
      </div>
      <dialog
        ref={confirmation}
        className={styles.confirmation}
        aria-labelledby={`reject-title-${jobId}`}
      >
        <h3 id={`reject-title-${jobId}`}>{t(copy.confirmReject)}</h3>
        <p>{value}</p>
        <div className="button-row">
          <Button name="action" value="reject" disabled={!canReject}>
            {t(copy.confirmReject)}
          </Button>
          <Button type="button" onClick={() => confirmation.current?.close()}>
            {t(copy.cancel)}
          </Button>
        </div>
      </dialog>
      <p className="muted">{t(copy.approvalHint)}</p>
    </NavigatingActionForm>
  );
}

function readReason(key: string) {
  try {
    return sessionStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}
