import { NavigatingActionForm } from "../components/NavigatingActionForm";
import { T } from "../components/TranslationProvider";
import { ui } from "../../lib/messages";
import { Alert, Button, Card } from "../components/ui";
import {
  getPreparedImportContent,
  type ImportJob,
  type ImportAction,
} from "../../lib/ingestion-api";
import { getReaderOutline } from "../../lib/api";
import { transitionImportAction } from "../admin/import/actions";
import { ImportDecisionForm } from "./ImportDecisionForm";
import { importPhase } from "../../lib/import-workflow";

function ActionForm({
  action,
  jobId,
  label,
  runId,
  itemId,
}: {
  action: "confirm-outline" | "prepare" | "approve" | "reject" | "publish";
  jobId: string;
  runId?: string;
  itemId?: string;
  label: import("../../lib/messages").UiMessage;
}) {
  return (
    <NavigatingActionForm
      action={transitionImportAction}
      className="review-action-form"
    >
      <h3>
        <T value={label} />
      </h3>
      <input type="hidden" name="jobId" value={jobId} />
      {runId ? <input type="hidden" name="runId" value={runId} /> : null}
      {itemId ? <input type="hidden" name="itemId" value={itemId} /> : null}
      <input type="hidden" name="action" value={action} />
      <Button variant={action === "publish" ? "primary" : undefined}>
        <T value={label} />
      </Button>
    </NavigatingActionForm>
  );
}

type PreparedImport = Awaited<ReturnType<typeof getPreparedImportContent>>;
type ReaderOutline = Awaited<ReturnType<typeof getReaderOutline>>;

/** Renders the phase, safe failure and available actions without changing form boundaries. */
export function reviewWorkflow(
  job: ImportJob,
  actorId: string,
  phase: ReturnType<typeof importPhase>,
  actions: ImportAction[],
  error?: string,
  context?: { runId?: string; itemId?: string },
) {
  const actionHeading =
    phase === "prepare"
      ? ui.importWorkflow.preparation
      : phase === "approved"
        ? ui.importWorkflow.publication
        : ui.importWorkflow.review;
  const labels = {
    "confirm-outline": ui.importActions.confirmOutline,
    prepare: ui.importActions.prepareDraft,
    approve: ui.importActions.approveDraft,
    reject: ui.importActions.rejectImport,
    publish: ui.importActions.publishVersion,
  };
  const workflowErrors = ui.importWorkflow.errors;
  const errorMessage =
    error === "reason"
      ? ui.importActions.reasonRequired
      : error && Object.hasOwn(workflowErrors, error)
        ? workflowErrors[error as keyof typeof workflowErrors]
        : ui.importActions.actionFailed;
  return (
    <Card className="import-workflow">
      <div role="status" aria-live="polite">
        <h2>
          <T value={ui.importWorkflow.phases[phase]} />
        </h2>
        {phase === "approved" ? (
          <p>
            <T value={ui.importWorkflow.approvedHelp} />
          </p>
        ) : null}
        {phase === "publishing" ? (
          <p>
            <T value={ui.importWorkflow.publishingHelp} />
          </p>
        ) : null}
      </div>
      {error ? (
        <Alert tone="error">
          <T value={errorMessage} />
        </Alert>
      ) : null}
      {actions.length ? (
        <section aria-labelledby="import-actions-heading">
          <h2 id="import-actions-heading">
            <T value={actionHeading} />
          </h2>
          <div className="review-action-grid">
            {actions.some(
              (action) => action === "approve" || action === "reject",
            ) ? (
              <ImportDecisionForm
                key={`${actorId}:${job.id}`}
                actorId={actorId}
                jobId={job.id}
                canApprove={actions.includes("approve")}
                canReject={actions.includes("reject")}
                {...context}
              />
            ) : null}
            {actions
              .filter((action) => action !== "approve" && action !== "reject")
              .map((action) => (
                <ActionForm
                  key={action}
                  action={action}
                  jobId={job.id}
                  label={labels[action]}
                  {...context}
                />
              ))}
          </div>
        </section>
      ) : phase === "prepare" || phase === "review" || phase === "approved" ? (
        <p>
          <T value={ui.importWorkflow.waiting} />
        </p>
      ) : null}
    </Card>
  );
}

/** Retains preview warnings and encoded publication destinations for each persisted status. */
export function reviewStatus(job: ImportJob, prepared: PreparedImport) {
  const versionHref =
    job.status === "completed" && job.versionId && job.isoCode
      ? `/countries/${encodeURIComponent(job.isoCode)}/versions/${encodeURIComponent(job.versionId)}`
      : null;
  return {
    pending:
      job.status === "pending_review" ? (
        <Alert>
          <T value={ui.admin.import.jobid.page.thisImportIsPendingReviewItIs} />
        </Alert>
      ) : null,
    unavailable:
      job.versionId && !prepared ? (
        <Alert tone="error">
          <T value={ui.importReview.previewUnavailable} />
        </Alert>
      ) : null,
    failed:
      job.status === "failed" ? (
        <Alert tone="error">
          <T value={ui.admin.import.jobid.page.theImportFailed} />
        </Alert>
      ) : null,
    published:
      job.status === "completed" && versionHref ? (
        <Alert tone="success">
          <T value={ui.admin.import.jobid.page.importCompleted} />{" "}
          <a href={versionHref}>
            <T value={ui.admin.import.jobid.page.openThePublishedVersion} />
          </a>
        </Alert>
      ) : null,
  };
}

/** Displays submitted identity/source metadata with the current reader outline. */
export function reviewSource(
  payload: Record<string, unknown> | null,
  job: ImportJob,
  outline: ReaderOutline,
) {
  return payload ? (
    <Card>
      <h2>
        {String(payload.constitutionTitle ?? "")} ·{" "}
        {String(payload.versionLabel ?? "")}
      </h2>
      <p>{String(payload.countryName ?? job.isoCode ?? "")}</p>
      {typeof payload.sourceUrl === "string" &&
      payload.sourceUrl.startsWith("https://") ? (
        <p>
          <a href={payload.sourceUrl} target="_blank" rel="noreferrer">
            <T value={ui.importReview.source} />
          </a>
        </p>
      ) : null}
      {typeof payload.gazetteReference === "string" ? (
        <p>{payload.gazetteReference}</p>
      ) : null}
      {outline?.kinds.length ? (
        <p>
          <strong>
            <T value={ui.importWorkflow.structure} />:
          </strong>{" "}
          {outline.kinds.map((kind) => kind.displayLabel).join(" → ")}
        </p>
      ) : null}
      <p>
        <a href="#import-structure">
          <T value={ui.importWorkflow.checkStructure} />
        </a>
      </p>
    </Card>
  ) : null;
}
