import Link from "next/link";
import type { ReactNode } from "react";
import { currentLocale } from "../../lib/server-locale";
import { message } from "../../lib/messages";
import { DocumentLinks } from "./documents/DocumentLinks";
import { notFound } from "next/navigation";
import { currentUser, requireSessionBearer } from "../../lib/session";
import {
  getImportJob,
  getImportPayload,
  getImportReviewDecisions,
  getPreparedImportContent,
} from "../../lib/ingestion-api";
import { getReaderOutline } from "../../lib/api";
import {
  getMigrationRun,
  getMigrationAttempts,
  getImportFidelity,
  readCapturedSource,
  type MigrationRun,
  type MigrationItem,
  type MigrationSource,
} from "../../lib/migration-review";
import {
  packageReviewHref,
  selectImportEvidence,
  sourcesForItem,
  needsIntervention,
  waitsForPublication,
  type ImportReviewQuery,
} from "../../lib/import-review";
import { importActions, importPhase } from "../../lib/import-workflow";
import { importReviewUi as copy } from "../../lib/import-review-messages";
import {
  migrationUi,
  migrationStateMessage,
} from "../../lib/migration-messages";
import { statusMessage } from "../../lib/ui-labels";
import { ui } from "../../lib/messages";
import { reviewUi } from "../../lib/ui-review-messages";
import { T } from "../components/TranslationProvider";
import { LocalizedRegion } from "../components/LocalizedRegion";
import { AdminForbidden } from "../components/AdminForbidden";
import { Alert, Badge, Button, PageHeader, Select } from "../components/ui";
import { Disclosure } from "../components/Disclosure";
import { WorkspacePage } from "../components/layout/templates";
import { ConstitutionDocument } from "../components/ConstitutionDocument";
import { OrderedContentTree } from "../components/ConstitutionText";
import { NavigatingActionForm } from "../components/NavigatingActionForm";
import { prepareImportPackageAction } from "../admin/import/actions";
import { ImportPreview } from "../admin/import/ImportPreview";
import {
  ImportReviewWorkspace,
  type ImportReviewTab,
  type ImportDisplay,
} from "./ImportReviewWorkspace";
import { ArchivedImportSource } from "./ArchivedImportSource";
import {
  reviewWorkflow,
  reviewStatus,
  reviewSource,
} from "./ImportReviewSections";
import styles from "./ImportReviewWorkspace.module.css";

export async function ImportReview({
  jobId,
  runId,
  error,
  query = {},
}: {
  jobId?: string;
  runId?: string;
  error?: string;
  query?: ImportReviewQuery;
}) {
  const user = await currentUser();
  if (
    !user?.roles.some((role) =>
      ["editor", "reviewer", "publisher", "admin"].includes(role),
    )
  )
    return <AdminForbidden title={ui.forbidden.import} />;
  const authorization = await requireSessionBearer();
  const selection = await loadImportSelection(
    jobId,
    runId,
    query,
    authorization,
  ).catch(() => null);
  if (!selection) {
    return (
      <WorkspacePage
        header={<PageHeader title={<T value={ui.importReview.title} />} />}
      >
        <Alert tone="error">
          <T value={ui.admin.import.jobid.page.theImportServiceIsUnavailable} />
        </Alert>
      </WorkspacePage>
    );
  }
  const { run, job } = selection;
  if ((jobId && !job) || (runId && !run)) notFound();
  const { selected, source, capture } = run
    ? selectImportEvidence(run, query)
    : { selected: undefined, source: undefined, capture: undefined };
  const data = await loadReviewData(
    job,
    run,
    selected,
    capture,
    source,
    query,
    authorization,
  );
  const { payload, prepared, original } = data;
  const title = importReviewTitle(job, run, selected, data.payload);
  const actions = job
    ? importActions(job, user.roles, Boolean(payload?.outline)).filter(
        (action) => action !== "approve" || Boolean(prepared),
      )
    : [];
  const context =
    run && selected ? { runId: run.id, itemId: selected.id } : undefined;
  const phase = job ? importPhase(job) : null;
  const href = (extra: Record<string, string>) =>
    run
      ? packageReviewHref(run.id, selected?.id, {
          ...(source ? { source: source.sourceKey } : {}),
          ...extra,
        })
      : `/editor?importJobId=${encodeURIComponent(jobId ?? "")}`;
  const model = { ...data, run, job, selected, source, capture, query, href };
  const evidence = await supplementaryEvidence(
    job,
    run,
    href({ display: "source" }),
  );
  const next = run?.items.find(
    (item) =>
      item.id !== selected?.id &&
      item.kind === "snapshot" &&
      item.result.status === "pending_review",
  );
  return (
    <ImportReviewWorkspace
      key={selected?.id ?? job?.id ?? run?.id}
      title={title}
      summary={
        run ? (
          <>
            {run.manifest.title} · {run.coverage.prepared}/{run.coverage.staged}{" "}
            <T value={copy.prepared} />
          </>
        ) : undefined
      }
      status={<ImportStatus model={model} />}
      jobStatus={
        job?.status === "pending_review" && !job.versionId
          ? "prepare"
          : job?.status
      }
      reading={<ImportReading model={model} />}
      source={<ImportSourceView model={model} evidence={evidence} />}
      review={
        job && phase ? (
          <ImportReviewPanel
            model={model}
            actions={actions}
            phase={phase}
            error={error}
            context={context}
          />
        ) : undefined
      }
      history={<ImportHistory model={model} />}
      navigation={
        run ? (
          <PackageNavigation run={run} selected={selected} query={query} />
        ) : undefined
      }
      initialTab={initialReviewTab(query, job, error)}
      initialDisplay={initialReviewDisplay(query, original, job)}
      canCompare={Boolean(original)}
      nextHref={run && next ? packageReviewHref(run.id, next.id) : undefined}
      notice={<ImportNotice model={model} />}
      preparation={<PackagePreparation model={model} roles={user.roles} />}
    />
  );
}

function offset(value?: string) {
  return Math.max(0, Number.parseInt(value ?? "0", 10) || 0);
}
function itemStatus(item: MigrationItem, items: MigrationItem[]) {
  return needsIntervention(item, items)
    ? copy.attention
    : item.state === "prepared" && item.kind !== "snapshot"
      ? copy.prepared
      : item.state === "blocked" || waitsForPublication(item, items)
        ? copy.waiting
        : item.kind === "snapshot" && item.result.status
          ? statusMessage(item.result.status)
          : migrationStateMessage(item.state);
}
function PackageNavigation({
  run,
  selected,
  query,
}: {
  run: MigrationRun;
  selected?: MigrationItem;
  query: ImportReviewQuery;
}) {
  const visible = run.items.filter(
    (item) =>
      !query.state ||
      (query.state === "attention"
        ? needsIntervention(item, run.items)
        : item.state === query.state),
  );
  const groups = [
    {
      name: copy.versions,
      items: visible.filter((item) => item.kind === "snapshot"),
    },
    {
      name: copy.sources,
      items: visible.filter((item) =>
        ["document", "citation"].includes(item.kind),
      ),
    },
    {
      name: copy.supporting,
      items: visible.filter(
        (item) => !["snapshot", "document", "citation"].includes(item.kind),
      ),
    },
  ];
  return (
    <LocalizedRegion as="nav" label={copy.showPackage}>
      {query.state ||
      run.items.some((item) => needsIntervention(item, run.items)) ? (
        <form action={packageReviewHref(run.id)} method="get">
          <input type="hidden" name="item" value={selected?.id ?? ""} />
          <Select
            name="state"
            label={<T value={migrationUi.filter} />}
            defaultValue={query.state ?? ""}
          >
            <option value="">—</option>
            <option value="attention">
              <T value={copy.attention} />
            </option>
            {["prepared", "blocked", "failed", "staged"].map((state) => (
              <option key={state} value={state}>
                <T value={migrationStateMessage(state)} />
              </option>
            ))}
          </Select>
          <Button>
            <T value={migrationUi.filter} />
          </Button>
        </form>
      ) : null}
      {groups.map((group, index) => {
        const list = (
          <ul>
            {group.items.map((item) => (
              <li key={item.id}>
                <Link
                  href={packageReviewHref(run.id, item.id)}
                  aria-current={selected?.id === item.id ? "page" : undefined}
                >
                  {item.sourceKey}
                  <small>
                    <T value={itemStatus(item, run.items)} />
                  </small>
                </Link>
              </li>
            ))}
          </ul>
        );
        return index === 0 ? (
          <section key={group.name.en}>
            <h2>
              <T value={group.name} /> · {group.items.length}
            </h2>
            {list}
          </section>
        ) : (
          <details
            key={group.name.en}
            open={group.items.some(
              (item) =>
                item.id === selected?.id || needsIntervention(item, run.items),
            )}
          >
            <summary>
              <T value={group.name} /> · {group.items.length}
            </summary>
            {list}
          </details>
        );
      })}
      {!run.items.length ? (
        <p>
          <T value={copy.empty} />
        </p>
      ) : null}
      <Disclosure summary={<T value={migrationUi.sources} />}>
        <ul>
          {run.manifest.sources.map((source) => (
            <li key={source.sourceKey}>
              <Link
                href={packageReviewHref(run.id, selected?.id, {
                  source: source.sourceKey,
                  display: "source",
                })}
              >
                {source.sourceKey}
              </Link>
              <small>
                <T value={copy[source.disposition]} />
                {source.reason ? ` · ${source.reason}` : ""}
              </small>
            </li>
          ))}
        </ul>
      </Disclosure>
    </LocalizedRegion>
  );
}
function NativeImportItem({
  item,
  returnTo,
}: {
  item: MigrationItem;
  returnTo: string;
}) {
  const result = item.result;
  const href = result.documentId
    ? `/documents?${new URLSearchParams({ documentId: result.documentId, returnTo })}`
    : result.amendmentId
      ? `/editor/amendments/${encodeURIComponent(result.amendmentId)}`
      : result.comparisonId
        ? `/comparisons/${encodeURIComponent(result.comparisonId)}`
        : null;
  return (
    <div className={styles.native}>
      {href ? (
        <Link className="btn" href={href}>
          <T
            value={
              result.documentId
                ? migrationUi.openDocument
                : migrationUi.openReview
            }
          />
        </Link>
      ) : null}
    </div>
  );
}

type ReviewJob = NonNullable<Awaited<ReturnType<typeof getImportJob>>>;
type ReviewModel = Awaited<ReturnType<typeof loadReviewData>> & {
  run: MigrationRun | null;
  job: ReviewJob | null;
  selected?: MigrationItem;
  source?: MigrationSource;
  capture?: MigrationItem;
  query: ImportReviewQuery;
  href: (extra: Record<string, string>) => string;
};

async function loadImportSelection(
  jobId: string | undefined,
  runId: string | undefined,
  query: ImportReviewQuery,
  authorization: string,
) {
  const run = runId ? await getMigrationRun(runId, authorization) : null;
  const selectedId = run
    ? selectImportEvidence(run, query).selected?.result.jobId
    : jobId;
  const job = selectedId ? await getImportJob(selectedId, authorization) : null;
  return { run, job };
}

async function loadReviewData(
  job: ReviewJob | null,
  run: MigrationRun | null,
  selected: MigrationItem | undefined,
  capture: MigrationItem | undefined,
  source: MigrationSource | undefined,
  query: ImportReviewQuery,
  authorization: string,
) {
  const versionId = job?.versionId ?? selected?.result.versionId;
  const [payload, decisions, prepared, outline, fidelity, attempts] =
    await Promise.all([
      job ? getImportPayload(job.id, authorization).catch(() => null) : null,
      job
        ? getImportReviewDecisions(job.id, authorization).catch(() => [])
        : [],
      versionId
        ? getPreparedImportContent(versionId, authorization).catch(() => null)
        : null,
      versionId
        ? getReaderOutline(versionId, authorization).catch(() => null)
        : null,
      run && job
        ? getImportFidelity(job.id, authorization).catch(() => null)
        : null,
      run && selected
        ? getMigrationAttempts(
            run.id,
            selected.id,
            offset(query.attemptOffset),
            authorization,
          ).catch(() => null)
        : null,
    ]);
  let original: string | null = null,
    evidenceFailed = false;
  if (capture?.state === "prepared" && source)
    try {
      original = await readCapturedSource(capture, source, authorization);
    } catch {
      evidenceFailed = true;
    }
  return {
    versionId,
    payload,
    decisions,
    prepared,
    outline,
    fidelity,
    attempts,
    original,
    evidenceFailed,
  };
}

function ImportSourceView({
  model,
  evidence,
}: {
  model: ReviewModel;
  evidence: ReactNode;
}) {
  const {
    run,
    selected,
    source,
    capture,
    original,
    evidenceFailed,
    payload,
    job,
    outline,
    query,
    href,
  } = model;
  const sourceOffset = offset(query.sourceOffset),
    sourcePage = original?.slice(sourceOffset, sourceOffset + 30000);
  return (
    <>
      <h2>
        <T value={copy.sourceHeading} />
      </h2>
      {run && selected && sourcesForItem(run, selected).length > 1 ? (
        <LocalizedRegion as="nav" label={copy.chooseSource}>
          {sourcesForItem(run, selected).map((candidate) => (
            <Link
              key={candidate.sourceKey}
              href={packageReviewHref(run!.id, selected.id, {
                source: candidate.sourceKey,
                display: "source",
              })}
              aria-current={
                candidate.sourceKey === source?.sourceKey ? "page" : undefined
              }
            >
              {candidate.sourceKey}
            </Link>
          ))}
        </LocalizedRegion>
      ) : null}
      {sourcePage != null && source ? (
        <ArchivedImportSource html={sourcePage} sourceUrl={source.url} />
      ) : evidenceFailed ? (
        <Alert tone="error">
          <T value={migrationUi.sourceInvalid} />
        </Alert>
      ) : (
        <p>
          <T value={migrationUi.missingSource} />
          {source?.reason ? ` · ${source.reason}` : ""}
        </p>
      )}
      <ImportSourceMetadata model={model} />
      {original != null ? (
        <Disclosure summary={<T value={copy.raw} />}>
          <pre className={styles.raw}>{sourcePage}</pre>
        </Disclosure>
      ) : null}
      {capture?.result.documentId && capture.result.revision ? (
        <p>
          <a
            href={`/documents/${encodeURIComponent(capture.result.documentId)}?revision=${capture.result.revision}`}
          >
            <T value={migrationUi.downloadSource} />
          </a>
        </p>
      ) : null}
      <ImportSourcePagination model={model} />
      {payload ? (
        <Disclosure
          id="import-structure"
          summary={<T value={ui.importReview.submittedContent} />}
        >
          <ImportPreview payload={payload} outline={outline} />
        </Disclosure>
      ) : null}
      {selected && !job ? (
        <NativeImportItem
          item={selected}
          returnTo={href({ display: "source" })}
        />
      ) : null}
      {evidence}
    </>
  );
}

async function supplementaryEvidence(
  job: ReviewJob | null,
  run: MigrationRun | null,
  returnTo: string,
) {
  if (!job && !run) return null;
  const locale = await currentLocale();
  const [jobEvidence, packageEvidence] = await Promise.all([
    job
      ? DocumentLinks({
          targetType: "import_job",
          targetId: job.id,
          returnTo,
          canEdit: true,
          headingLevel: "h3",
          heading: message(locale, copy.jobEvidence),
        })
      : null,
    run
      ? DocumentLinks({
          targetType: "migration_run",
          targetId: run.id,
          returnTo,
          canEdit: true,
          headingLevel: "h3",
          heading: message(locale, copy.packageEvidence),
        })
      : null,
  ]);
  return (
    <section id="supplementary-evidence" className={styles.evidence}>
      <h2>
        <T value={copy.supplementaryEvidence} />
      </h2>
      {jobEvidence}
      {packageEvidence}
    </section>
  );
}

function ImportSourceMetadata({ model }: { model: ReviewModel }) {
  const { source, payload, job, outline } = model;
  return (
    <>
      {source || payload ? (
        <Disclosure summary={<T value={copy.details} />}>
          {payload ? reviewSource(payload, job!, outline) : null}
          {source ? (
            <>
              <dl>
                <dt>URL</dt>
                <dd>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {source.url}
                  </a>
                </dd>
                {source.attribution ? (
                  <>
                    <dt>
                      <T value={copy.attribution} />
                    </dt>
                    <dd>{source.attribution}</dd>
                  </>
                ) : null}
                {source.sha256 ? (
                  <>
                    <dt>SHA-256</dt>
                    <dd>
                      <code>{source.sha256}</code>
                    </dd>
                  </>
                ) : null}
                {source.encoding ? (
                  <>
                    <dt>
                      <T value={copy.encoding} />
                    </dt>
                    <dd>{source.encoding}</dd>
                  </>
                ) : null}
                {source.aliases.length ? (
                  <>
                    <dt>
                      <T value={copy.aliases} />
                    </dt>
                    <dd>{source.aliases.join("\n")}</dd>
                  </>
                ) : null}
              </dl>
            </>
          ) : null}
        </Disclosure>
      ) : null}
    </>
  );
}

function ImportSourcePagination({ model }: { model: ReviewModel }) {
  const { original, href } = model;
  const sourceOffset = offset(model.query.sourceOffset);
  return (
    <>
      {original && original.length > 30000 ? (
        <LocalizedRegion as="nav" label={copy.sourcePages}>
          <p>
            {sourceOffset + 1}–{Math.min(sourceOffset + 30000, original.length)}
            /{original.length}
          </p>
          {sourceOffset ? (
            <Link
              href={href({
                sourceOffset: String(Math.max(0, sourceOffset - 30000)),
                display: "source",
              })}
            >
              ← <T value={migrationUi.previous} />
            </Link>
          ) : null}
          {sourceOffset + 30000 < original.length ? (
            <Link
              href={href({
                sourceOffset: String(sourceOffset + 30000),
                display: "source",
              })}
            >
              <T value={migrationUi.next} /> →
            </Link>
          ) : null}
        </LocalizedRegion>
      ) : null}
    </>
  );
}

function ImportReading({ model }: { model: ReviewModel }) {
  const { prepared, outline } = model;
  return (
    <>
      <h2>
        <T value={copy.readingHeading} />
      </h2>
      {prepared ? (
        <ConstitutionDocument className={styles.document}>
          <OrderedContentTree
            entries={prepared.roots.map((node) => ({
              type: "child" as const,
              node,
            }))}
            outline={outline ?? undefined}
          />
        </ConstitutionDocument>
      ) : (
        <p>
          <T value={migrationUi.notPrepared} />
        </p>
      )}
    </>
  );
}

function ImportReviewPanel({
  model,
  actions,
  phase,
  error,
  context,
}: {
  model: ReviewModel;
  actions: ReturnType<typeof importActions>;
  phase: ReturnType<typeof importPhase>;
  error?: string;
  context?: { runId: string; itemId: string };
}) {
  const { job, prepared, query } = model;
  const statuses = job ? reviewStatus(job, prepared) : null;
  return job && phase ? (
    <>
      {statuses?.pending}
      {statuses?.unavailable}
      {statuses?.failed}
      {statuses?.published}
      <ImportChecks fidelity={model.fidelity} />
      {reviewWorkflow(job, phase, actions, error ?? query.error, context)}
      {job.errors.length ? (
        <ul>
          {job.errors.map((problem) => (
            <li key={`${problem.code}:${problem.message}`}>
              <code>{problem.code}</code> — {problem.message}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  ) : undefined;
}

function ImportChecks({ fidelity }: { fidelity: ReviewModel["fidelity"] }) {
  return (
    <>
      {fidelity ? (
        <section>
          <h2>
            <T value={copy.checks} />
          </h2>
          <p>
            <T
              value={
                fidelity.fidelityComplete && fidelity.resourcesComplete
                  ? migrationUi.fidelityPassed
                  : migrationUi.fidelityIncomplete
              }
            />
          </p>
          {fidelity.fidelity.length ? (
            <ul>
              {fidelity.fidelity.map((difference, index) => (
                <li key={index}>
                  {difference.path}: {difference.reason}
                </li>
              ))}
            </ul>
          ) : null}
          {!fidelity.fidelityComplete && fidelity.fidelity.length >= 100 ? (
            <Alert>
              <T value={migrationUi.moreMismatches} />
            </Alert>
          ) : null}
        </section>
      ) : null}
    </>
  );
}

function ImportHistory({ model }: { model: ReviewModel }) {
  const { decisions, attempts, job, versionId, prepared, selected, href } =
    model;
  return (
    <>
      {decisions.length ? (
        <section>
          <h2>
            <T value={ui.admin.import.jobid.page.reviewDecisions} />
          </h2>
          <ol>
            {decisions.map((decision) => (
              <li key={decision.id}>
                <strong>{decision.decision}</strong> ·{" "}
                {new Date(decision.decidedAt).toLocaleString()}
                <p>{decision.reason}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      {attempts ? (
        <section>
          <h2>
            <T value={migrationUi.attempts} />
          </h2>
          <ol>
            {attempts.items.map((attempt) => (
              <li key={attempt.number}>
                {attempt.startedAt} ·{" "}
                <T value={migrationStateMessage(attempt.state)} />
                {attempt.error ? <p>{attempt.error}</p> : null}
              </li>
            ))}
          </ol>
          {attempts.nextOffset != null ? (
            <Link
              href={href({
                attemptOffset: String(attempts.nextOffset),
                view: "history",
              })}
            >
              <T value={migrationUi.next} /> →
            </Link>
          ) : null}
        </section>
      ) : null}
      <Disclosure summary={<T value={reviewUi.technicalDetails} />}>
        <dl className="technical-identifiers">
          {job ? (
            <>
              <dt>Import</dt>
              <dd>
                <code>{job.id}</code>
              </dd>
            </>
          ) : null}
          {versionId ? (
            <>
              <dt>
                <T value={ui.admin.import.jobid.page.draftVersion} />
              </dt>
              <dd>
                <code>{versionId}</code>
              </dd>
            </>
          ) : null}
          {prepared ? (
            <>
              <dt>
                <T value={ui.admin.import.jobid.page.contentGeneration} />
              </dt>
              <dd>{prepared.generation}</dd>
              <dt>
                <T value={ui.admin.import.jobid.page.settingsRevision} />
              </dt>
              <dd>
                <code>{prepared.settingsRevisionId ?? "unbound"}</code>
              </dd>
            </>
          ) : null}
          {selected ? (
            <>
              <dt>SHA-256</dt>
              <dd>
                <code>{selected.sha256}</code>
              </dd>
            </>
          ) : null}
        </dl>
      </Disclosure>
    </>
  );
}

function ImportNotice({ model }: { model: ReviewModel }) {
  const { job, query, selected, run } = model;
  return !job && query.error ? (
    <Alert tone="error">
      <T value={copy.unknown} />
    </Alert>
  ) : selected && needsIntervention(selected, run!.items) ? (
    <Alert tone="error">
      <T value={copy.intervention} />
      {selected.error ? <p>{selected.error}</p> : null}
    </Alert>
  ) : !job && selected && selected.state !== "prepared" ? (
    <Alert>
      <T
        value={
          waitsForPublication(selected, run!.items)
            ? copy.publicationWait
            : copy.dependencyWait
        }
      />
    </Alert>
  ) : null;
}

function PackagePreparation({
  model,
  roles,
}: {
  model: ReviewModel;
  roles: string[];
}) {
  const { run, selected } = model;
  const pending = run?.items.filter(
    (item) =>
      !["prepared", "preparing"].includes(item.state) &&
      !waitsForPublication(item, run!.items),
  );
  return run &&
    pending?.length &&
    roles.some((role) => ["editor", "admin"].includes(role)) ? (
    <NavigatingActionForm action={prepareImportPackageAction}>
      <input type="hidden" name="runId" value={run.id} />
      <input type="hidden" name="itemId" value={selected?.id ?? ""} />
      <p className="muted">
        <T value={copy.prepareHelp} />
      </p>
      <Button variant="primary">
        <T value={copy.prepare} />
      </Button>
    </NavigatingActionForm>
  ) : undefined;
}

function initialReviewTab(
  query: ImportReviewQuery,
  job: ReviewJob | null,
  error?: string,
): ImportReviewTab {
  return ["content", "review", "history"].includes(query.view ?? "")
    ? (query.view as ImportReviewTab)
    : error ||
        query.error ||
        (job && (job.status !== "pending_review" || !job.versionId))
      ? "review"
      : "content";
}

function initialReviewDisplay(
  query: ImportReviewQuery,
  original: string | null,
  job: ReviewJob | null,
): ImportDisplay {
  return ["reading", "source", "compare"].includes(query.display ?? "")
    ? (query.display as ImportDisplay)
    : original != null && job
      ? "compare"
      : "reading";
}

function importReviewTitle(
  job: ReviewJob | null,
  run: MigrationRun | null,
  selected: MigrationItem | undefined,
  payload: ReviewModel["payload"],
) {
  return (
    [
      String(payload?.constitutionTitle ?? job?.constitutionTitle ?? ""),
      String(payload?.versionLabel ?? job?.versionLabel ?? ""),
    ]
      .filter(Boolean)
      .join(" · ") ||
    selected?.sourceKey ||
    run?.manifest.title ||
    job?.id ||
    ""
  );
}

function ImportStatus({ model }: { model: ReviewModel }) {
  const { selected, run, job } = model;
  return (
    <Badge
      tone={
        selected && needsIntervention(selected, run!.items) ? "removed" : "info"
      }
    >
      <T
        value={
          job
            ? statusMessage(job.status)
            : selected
              ? itemStatus(selected, run!.items)
              : copy.package
        }
      />
    </Badge>
  );
}
