"use client";

import { useState, useRef, type FormEvent, type ReactNode } from "react";
import type { OutlineKindWrite } from "../../../../lib/api";
import type { SetupProposal } from "../../../../lib/ingestion-api";
import {
  displayKinds,
  setupKinds,
  setupOutline,
} from "../../../../lib/setup-review";
import { ui } from "../../../../lib/messages";
import { useTranslation } from "../../../components/TranslationProvider";
import { Stack } from "../../../components/layout/Layout";
import { Alert, Badge, Button, Card } from "../../../components/ui";
import {
  StructureWorkspaceTemplate,
  OutlineWorkspace,
  StructurePanel,
} from "../../constitutions/StructureWorkspaceTemplate";
import {
  explicitLayers,
  withoutExisting,
} from "../../constitutions/outline-editor-model";
import { constitutionWorkspaceUi as m } from "../../../../lib/constitution-workspace-messages";
import { constitutionTasks } from "../../constitutions/StructureWorkspaceFrame";
import { ReaderIcon } from "../../../components/ReaderIcon";
import { OutlineReaderPreview } from "../../constitutions/OutlineReaderPreview";
import { previewRoots } from "../ImportPreview";
import { reviewSetupAction } from "./actions";
import styles from "./SetupProposalReview.module.css";

function Hierarchy({ kinds }: { kinds: OutlineKindWrite[] }) {
  const t = useTranslation();
  return (
    <ul className={styles.hierarchy}>
      {setupOutline(kinds).kinds.map((kind) => (
        <li key={kind.kindCode}>
          <strong>{kind.displayLabel}</strong>
          {kind.root ? ` · ${t(ui.setupReview.root)}` : ""}
          {" → "}
          {kind.allowedChildKinds?.length
            ? kind.allowedChildKinds
                .map(
                  (code) =>
                    kinds.find((child) => child.kindCode === code)
                      ?.displayLabel ?? code,
                )
                .join(", ")
            : t(ui.setupReview.text)}
        </li>
      ))}
    </ul>
  );
}

export function SetupProposalReview({
  proposal,
  error,
  identity,
  header,
  context,
  documents,
}: {
  proposal: SetupProposal;
  error?: string;
  identity?: ReactNode;
  header?: ReactNode;
  context?: ReactNode;
  documents?: ReactNode;
}) {
  const t = useTranslation();
  const [kinds, setKinds] = useState(() => setupKinds(proposal.payload));
  const [message, setMessage] = useState("");
  const [view, setView] = useState(
    error || proposal.status === "confirming" || proposal.status === "confirmed"
      ? "review"
      : "structure",
  );
  const feedback = useRef<HTMLDetailsElement>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const editable = proposal.status === "proposed";
  const recoverable = proposal.status === "confirming";
  function requestChanges() {
    setView("review");
    if (feedback.current) feedback.current.open = true;
    requestAnimationFrame(() =>
      feedback.current?.querySelector("textarea")?.focus(),
    );
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    const data = new FormData(event.currentTarget);
    data.set("intent", submitter?.value ?? "display");
    setBusy(true);
    setFailed(false);
    try {
      window.location.assign(await reviewSetupAction(data));
    } catch {
      setBusy(false);
      setFailed(true);
    }
  }
  const layers = explicitLayers(kinds, true),
    sample = previewRoots(proposal.payload.sampleRoots);
  return (
    <OutlineWorkspace
      layers={layers}
      onChange={(next) => setKinds(withoutExisting(next))}
      structural={false}
      display={editable && !busy}
      sampleRoots={sample}
      onRequestChanges={editable ? requestChanges : undefined}
      onNavigate={() => setView("structure")}
    >
      {({ navigation, content }) => (
        <StructureWorkspaceTemplate
          header={header}
          title={String(proposal.payload.constitutionTitle ?? "")}
          context={context}
          navigation={navigation}
          tabs={constitutionTasks}
          active={view}
          onSelect={setView}
          status={
            <>
              <Badge tone={proposal.changesRequested ? "changed" : "info"}>
                {t(proposalStatus(proposal))}
              </Badge>
              <span>
                {t(ui.setupReview.revision)} {proposal.revision}
              </span>
            </>
          }
          primary={
            view !== "review" && (editable || recoverable) ? (
              <Button type="button" onClick={() => setView("review")}>
                {t(m.review)}
                <ReaderIcon name="right" />
              </Button>
            ) : null
          }
        >
          {error || failed ? (
            <Alert tone="error">{t(proposalError(error))}</Alert>
          ) : null}
          <form
            onSubmit={submit}
            hidden={view === "documents" || view === "history"}
          >
            <input type="hidden" name="proposalId" value={proposal.id} />
            <input type="hidden" name="revision" value={proposal.revision} />
            <input
              type="hidden"
              name="display"
              value={JSON.stringify(displayKinds(kinds))}
            />
            <StructurePanel id="identity" active={view}>
              <Stack gap="card">
                {identity}
                <p className="muted">
                  {t(editable ? m.proposalHelp : m.proposalReadOnly)}
                </p>
              </Stack>
            </StructurePanel>
            <StructurePanel id="structure" active={view}>
              <Stack gap="card">
                <p className="muted">
                  {t(editable ? m.proposalHelp : m.proposalReadOnly)}
                </p>
                {content}
                {editable ? (
                  <div className={styles.actions}>
                    <Button name="intent" value="display" disabled={busy}>
                      {t(ui.setupReview.save)}
                    </Button>
                    <Button type="button" onClick={requestChanges}>
                      {t(m.requestStructure)}
                      <ReaderIcon name="right" />
                    </Button>
                  </div>
                ) : null}
              </Stack>
            </StructurePanel>
            <StructurePanel id="review" active={view}>
              <Stack gap="card">
                {proposalStatusCard(proposal, t)}
                <p>{t(m.setupOnly)}</p>
                {proposalChanges(proposal, t)}
                {proposal.requestedChanges ? (
                  <Card>
                    <h2>{t(ui.setupReview.recorded)}</h2>
                    <p className={styles.feedback}>
                      {proposal.requestedChanges}
                    </p>
                  </Card>
                ) : null}
                {recoverable ? (
                  <Card>
                    <Button
                      variant="primary"
                      name="intent"
                      value="confirm"
                      disabled={busy}
                    >
                      {t(
                        busy
                          ? ui.setupReview.saving
                          : ui.setupReview.resumeConfirmation,
                      )}
                    </Button>
                  </Card>
                ) : null}
                {editable ? (
                  <Card id="setup-final-review">
                    <h2>
                      {t(ui.admin.import.setup.proposalid.page.finalReview)}
                    </h2>
                    <div className={styles.actions}>
                      <Button
                        variant="primary"
                        name="intent"
                        value="confirm"
                        disabled={busy || proposal.changesRequested}
                      >
                        {t(
                          busy ? ui.setupReview.saving : ui.setupReview.confirm,
                        )}
                      </Button>
                    </div>
                    <details ref={feedback}>
                      <summary>{t(ui.setupReview.feedback)}</summary>
                      <p>{t(ui.setupReview.feedbackHelp)}</p>
                      <label htmlFor="setup-requested-changes">
                        {t(ui.setupReview.feedbackLabel)}
                      </label>
                      <textarea
                        id="setup-requested-changes"
                        name="message"
                        value={message}
                        maxLength={4000}
                        rows={4}
                        onChange={(event) => setMessage(event.target.value)}
                      />
                      <div className={styles.actions}>
                        <Button
                          name="intent"
                          value="request-changes"
                          disabled={busy || message.trim().length < 10}
                        >
                          {t(ui.setupReview.feedbackButton)}
                        </Button>
                      </div>
                    </details>
                    <details>
                      <summary>
                        {t(
                          ui.admin.import.setup.proposalid.page
                            .withdrawProposal,
                        )}
                      </summary>
                      <p>{t(m.withdrawHelp)}</p>
                      <Button
                        name="intent"
                        value="withdraw"
                        formNoValidate
                        disabled={busy}
                      >
                        {t(
                          ui.admin.import.setup.proposalid.page
                            .withdrawProposal,
                        )}
                      </Button>
                    </details>
                  </Card>
                ) : null}
              </Stack>
            </StructurePanel>
          </form>
          <StructurePanel id="documents" active={view}>
            {documents}
          </StructurePanel>
          <StructurePanel id="history" active={view}>
            <Stack gap="card">
              <h3>{t(m.proposalHistory)}</h3>
              <p>
                {t(ui.setupReview.revision)} {proposal.revision} ·{" "}
                {t(proposalStatus(proposal))}
              </p>
              {proposalChanges(proposal, t) ?? <p>{t(m.noPreviousProposal)}</p>}
              {proposal.requestedChanges ? (
                <p className={styles.feedback}>{proposal.requestedChanges}</p>
              ) : null}
            </Stack>
          </StructurePanel>
        </StructureWorkspaceTemplate>
      )}
    </OutlineWorkspace>
  );
}

type SetupTranslation = ReturnType<typeof useTranslation>;

/** Preserves confirmation/closed/feedback/revision status precedence. */
function proposalStatus(proposal: SetupProposal) {
  const editable = proposal.status === "proposed";
  const previous = proposal.previousPayload;
  return proposal.status === "confirmed"
    ? ui.setupReview.confirmed
    : proposal.status === "confirming"
      ? ui.setupReview.confirming
      : !editable
        ? ui.setupReview.closed
        : proposal.changesRequested
          ? ui.setupReview.changesRequested
          : previous
            ? ui.setupReview.revised
            : ui.setupReview.waiting;
}

/** Compares only the historical structural/display projections and identity metadata. */
function proposalDifferences(proposal: SetupProposal) {
  const previous = proposal.previousPayload;
  const metadata = [
    "constitutionTitle",
    "countryName",
    "isoCode",
    "languageCode",
    "sourceUrl",
    "gazetteReference",
    "constitutionSlug",
    "jurisdictionId",
    "predecessorConstitutionId",
    "interim",
  ] as const;
  const changedMetadata = previous
    ? metadata.filter((field) => previous[field] !== proposal.payload[field])
    : [];
  const structure = (values: OutlineKindWrite[]) =>
    values.map((kind) => ({
      kindCode: kind.kindCode,
      root: kind.root,
      allowedChildKinds: kind.allowedChildKinds,
      allowTextAlongsideChildren: kind.allowTextAlongsideChildren,
      titlePolicy: kind.titlePolicy,
      labelPolicy: kind.labelPolicy,
      segmentation: kind.segmentation,
    }));
  const hierarchyChanged =
    previous &&
    JSON.stringify(structure(setupKinds(previous))) !==
      JSON.stringify(structure(setupKinds(proposal.payload)));
  const sampleChanged =
    previous &&
    JSON.stringify(previous.sampleRoots) !==
      JSON.stringify(proposal.payload.sampleRoots);
  const displayChanged =
    previous &&
    JSON.stringify(displayKinds(setupKinds(previous))) !==
      JSON.stringify(displayKinds(setupKinds(proposal.payload)));
  return { changedMetadata, hierarchyChanged, sampleChanged, displayChanged };
}

/** Keeps frozen revision status and resume/reload guidance in the final review. */
function proposalStatusCard(proposal: SetupProposal, t: SetupTranslation) {
  const editable = proposal.status === "proposed";
  const recoverable = proposal.status === "confirming";
  return (
    <Card className="import-workflow">
      <h2>{t(proposalStatus(proposal))}</h2>
      <p>
        {t(ui.setupReview.revision)} {proposal.revision}
      </p>
      {editable ? (
        <p>{t(ui.setupReview.waitHelp)}</p>
      ) : proposal.status === "confirmed" ? (
        <p>{t(ui.setupReview.resume)}</p>
      ) : recoverable ? (
        <p>{t(ui.setupReview.recoveryHelp)}</p>
      ) : null}
      <a href={`/admin/import/setup/${proposal.id}`}>
        {t(ui.setupReview.reload)}
      </a>
    </Card>
  );
}

/** Renders exact prior/current comparisons, including the historical display-only unchanged note. */
function proposalChanges(proposal: SetupProposal, t: SetupTranslation) {
  const previous = proposal.previousPayload;
  const { changedMetadata, hierarchyChanged, sampleChanged, displayChanged } =
    proposalDifferences(proposal);
  return previous ? (
    <Card>
      <h2>{t(ui.setupReview.changes)}</h2>
      {hierarchyChanged ? <p>{t(ui.setupReview.hierarchyChanged)}</p> : null}
      {sampleChanged ? <p>{t(ui.setupReview.sampleChanged)}</p> : null}
      {displayChanged ? <p>{t(ui.setupReview.displayChanged)}</p> : null}
      {changedMetadata.length ? (
        <dl className={styles.comparison}>
          {changedMetadata.map((field) => (
            <div key={field}>
              <dt>
                {t(
                  field === "sourceUrl" || field === "gazetteReference"
                    ? ui.admin.import.setup.proposalid.page.source
                    : field === "languageCode"
                      ? ui.admin.import.setup.proposalid.page.language
                      : field === "constitutionSlug"
                        ? ui.admin.import.setup.proposalid.page.slug
                        : ui.admin.import.setup.proposalid.page
                            .sourceAndIdentity,
                )}
              </dt>
              <dd>
                {t(ui.setupReview.previous)}: {String(previous[field] ?? "—")}
              </dd>
              <dd>
                {t(ui.setupReview.current)}:{" "}
                {String(proposal.payload[field] ?? "—")}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {!hierarchyChanged && !sampleChanged && !changedMetadata.length ? (
        <p>{t(ui.setupReview.unchanged)}</p>
      ) : null}
      <details>
        <summary>{t(ui.setupReview.previous)}</summary>
        <Hierarchy kinds={setupKinds(previous)} />
        <OutlineReaderPreview
          roots={previewRoots(previous.sampleRoots)}
          outline={setupOutline(setupKinds(previous))}
          label={t(ui.setupReview.previous)}
        />
      </details>
    </Card>
  ) : null;
}

/** Safe error copy retains the server's stale/running/rejected categories. */
function proposalError(error?: string) {
  if (error === "creation_rejected") return ui.setupReview.creationRejected;
  if (error === "running") return ui.setupReview.confirmationRunning;
  if (error === "stale") return ui.setupReview.stale;
  return ui.setupReview.error;
}
