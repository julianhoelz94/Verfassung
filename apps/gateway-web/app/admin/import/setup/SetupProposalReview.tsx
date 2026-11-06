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
import { Alert, Button, Card } from "../../../components/ui";
import {
  StructureWorkspaceTemplate,
  OutlineWorkspace,
  StructurePreview,
} from "../../constitutions/StructureWorkspaceTemplate";
import {
  explicitLayers,
  withoutExisting,
} from "../../constitutions/outline-editor-model";
import { structureUi as copy } from "../../../../lib/structure-workspace";
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
}: {
  proposal: SetupProposal;
  error?: string;
  identity?: ReactNode;
}) {
  const t = useTranslation();
  const [kinds, setKinds] = useState(() => setupKinds(proposal.payload));
  const [message, setMessage] = useState("");
  const [view, setView] = useState(
    proposal.status === "confirming" || proposal.status === "confirmed"
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
  const tabs = [
    { id: "structure", label: copy.structure },
    { id: "preview", label: copy.preview },
    { id: "proposal", label: copy.proposal },
    { id: "changes", label: copy.changes },
    { id: "review", label: copy.review },
  ];
  return (
    <>
      {proposalStatusCard(proposal, error, failed, t)}
      <StructureWorkspaceTemplate
        tabs={tabs}
        active={view}
        onSelect={setView}
        primary={
          <Button
            type="button"
            variant="primary"
            onClick={() => setView("review")}
          >
            {t(ui.setupReview.title)}
          </Button>
        }
      >
        <form onSubmit={submit}>
          <input type="hidden" name="proposalId" value={proposal.id} />
          <input type="hidden" name="revision" value={proposal.revision} />
          <input
            type="hidden"
            name="display"
            value={JSON.stringify(displayKinds(kinds))}
          />
          <div hidden={view !== "structure"}>
            <Stack>
              <OutlineWorkspace
                layers={layers}
                onChange={(next) => setKinds(withoutExisting(next))}
                structural={false}
                display={editable && !busy}
                sampleRoots={sample}
                onRequestChanges={editable ? requestChanges : undefined}
              />
              {editable ? (
                <Button name="intent" value="display" disabled={busy}>
                  {t(ui.setupReview.save)}
                </Button>
              ) : null}
            </Stack>
          </div>
          {view === "preview" ? (
            <StructurePreview layers={layers} sampleRoots={sample} />
          ) : null}
          <div hidden={view !== "proposal"}>{identity}</div>
          <div hidden={view !== "changes"}>{proposalChanges(proposal, t)}</div>
          <div hidden={view !== "review"}>
            {proposal.requestedChanges ? (
              <Card>
                <h2>{t(ui.setupReview.recorded)}</h2>
                <p className={styles.feedback}>{proposal.requestedChanges}</p>
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
                <h2>{t(ui.admin.import.setup.proposalid.page.finalReview)}</h2>
                <div className={styles.actions}>
                  <Button
                    variant="primary"
                    name="intent"
                    value="confirm"
                    disabled={busy || proposal.changesRequested}
                  >
                    {t(busy ? ui.setupReview.saving : ui.setupReview.confirm)}
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
                <div className={styles.actions}>
                  <Button
                    name="intent"
                    value="withdraw"
                    formNoValidate
                    disabled={busy}
                  >
                    {t(ui.admin.import.setup.proposalid.page.withdrawProposal)}
                  </Button>
                </div>
              </Card>
            ) : null}
          </div>
        </form>
      </StructureWorkspaceTemplate>
    </>
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

/** Keeps proposal status, safe error details and resume/reload guidance in their original card. */
function proposalStatusCard(
  proposal: SetupProposal,
  error: string | undefined,
  failed: boolean,
  t: SetupTranslation,
) {
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
      {error || failed ? (
        <Alert tone="error">
          {t(
            error === "creation_rejected"
              ? ui.setupReview.creationRejected
              : error === "running"
                ? ui.setupReview.confirmationRunning
                : error === "stale"
                  ? ui.setupReview.stale
                  : ui.setupReview.error,
          )}
        </Alert>
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
