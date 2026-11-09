import { loginHref } from "../../../lib/return-to";
import { redirect } from "next/navigation";
import { NavigatingActionForm } from "../../components/NavigatingActionForm";
import { Disclosure } from "../../components/Disclosure";
import { LocalizedRegion } from "../../components/LocalizedRegion";
import { statusMessage } from "../../../lib/ui-labels";
import { reviewUi } from "../../../lib/ui-review-messages";
import { T } from "../../components/TranslationProvider";
import { ui } from "../../../lib/messages";
import { AdminForbidden } from "../../components/AdminForbidden";
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  PageHeader,
  TextArea,
} from "../../components/ui";
import { WorkspacePage } from "../../components/layout/templates";
import { currentUser, requireSessionBearer } from "../../../lib/session";
import { listImportJobs, type ImportJob } from "../../../lib/ingestion-api";
import { createImportAction, createSetupProposalAction } from "./actions";
import Link from "next/link";
import {
  getMigrationRun,
  getMigrationRuns,
} from "../../../lib/migration-review";
import { importReviewUi } from "../../../lib/import-review-messages";
import { packageReviewHref } from "../../../lib/import-review";

type AdminImportPageProps = {
  searchParams: Promise<{ error?: string; mode?: string }>;
};

export default async function AdminImportPage({
  searchParams,
}: AdminImportPageProps) {
  const params = await searchParams;
  const user = await currentUser();
  if (!user) redirect(loginHref("/admin/import", params));
  if (
    !user.roles.some((role) =>
      ["editor", "reviewer", "publisher", "admin"].includes(role),
    )
  )
    return <AdminForbidden title={ui.forbidden.import} />;
  const canImport =
    user.roles.includes("editor") || user.roles.includes("admin");
  const authorization = await requireSessionBearer();
  const [jobs, packages] = await Promise.all([
    listImportJobs(authorization).catch(() => null),
    getMigrationRuns(authorization).catch(() => null),
  ]);
  const packageJobs = new Set<string>();
  // Resolve package membership in bounded batches, so package versions are not listed twice.
  for (let index = 0; index < (packages?.length ?? 0); index += 6) {
    const batch = await Promise.all(
      packages!
        .slice(index, index + 6)
        .map((item) =>
          getMigrationRun(item.id, authorization).catch(() => null),
        ),
    );
    for (const run of batch)
      for (const item of run?.items ?? [])
        if (item.result.jobId) packageJobs.add(item.result.jobId);
  }
  const individualJobs =
    jobs?.filter((job) => !packageJobs.has(job.id)) ?? null;
  const newStructure = params.mode === "new";

  return (
    <WorkspacePage
      width="content"
      header={
        <PageHeader
          title={<T value={ui.attrs.adminImportPagePageHeaderTitleImport} />}
          meta={<T value={ui.attrs.adminImportPagePageHeaderMetaStage} />}
        />
      }
    >
      {recentImports(individualJobs, packages)}
      {params.error ? (
        <Alert tone="error">
          <T value={stagingError(params.error)} />
        </Alert>
      ) : null}
      {canImport ? (
        <>
          <h2 className="section-title">
            <T value={reviewUi.importChoice} />
          </h2>
          <LocalizedRegion
            as="nav"
            className="task-choices"
            label={reviewUi.chooseImportPath}
          >
            <a
              href="?mode=existing#upload"
              aria-current={!newStructure ? "page" : undefined}
            >
              <span className="task-number" aria-hidden="true">
                01
              </span>
              <T value={reviewUi.existingStructure} />
            </a>
            <a
              href="?mode=new#structure"
              aria-current={newStructure ? "page" : undefined}
            >
              <span className="task-number" aria-hidden="true">
                02
              </span>
              <T value={reviewUi.newStructure} />
            </a>
          </LocalizedRegion>
          <div className="import-layout">
            <Card id={newStructure ? "structure" : "upload"}>
              <h2>
                <T
                  value={
                    newStructure
                      ? reviewUi.newStructure
                      : ui.admin.import.page.uploadAVersion
                  }
                />
              </h2>
              <p className="muted">
                <T
                  value={
                    newStructure ? reviewUi.proposalHint : reviewUi.uploadHint
                  }
                />
              </p>
              {newStructure ? (
                <NavigatingActionForm action={createSetupProposalAction}>
                  <Input
                    label={<T value={reviewUi.proposalFile} />}
                    id="proposalFile"
                    name="proposalFile"
                    type="file"
                    accept="application/json,.json"
                  />
                  <Disclosure
                    summary={<T value={reviewUi.pasteJson} />}
                    open={Boolean(params.error)}
                  >
                    <TextArea
                      label={
                        <T value={ui.attrs.adminImportPageTextAreaLabelSetup} />
                      }
                      id="proposal"
                      name="proposal"
                      rows={10}
                      spellCheck={false}
                    />
                  </Disclosure>
                  <Button variant="primary">
                    <T value={reviewUi.prepareStructure} />
                  </Button>
                </NavigatingActionForm>
              ) : (
                <NavigatingActionForm action={createImportAction}>
                  <Input
                    label={<T value={ui.attrs.adminImportPageInputLabelJSON} />}
                    id="file"
                    name="file"
                    type="file"
                    accept="application/json,.json"
                  />
                  <Disclosure
                    summary={<T value={reviewUi.pasteJson} />}
                    open={Boolean(params.error)}
                  >
                    <TextArea
                      label={
                        <T
                          value={ui.attrs.adminImportPageTextAreaLabelImport}
                        />
                      }
                      id="payload"
                      name="payload"
                      rows={12}
                      spellCheck={false}
                    />
                  </Disclosure>
                  <Button variant="primary">
                    <T value={ui.admin.import.page.stageForReview} />
                  </Button>
                </NavigatingActionForm>
              )}
            </Card>
            <aside className="task-guidance">
              <h2>
                <T value={reviewUi.importDetails} />
              </h2>
              <p>
                <T
                  value={
                    ui.admin.import.page
                      .useTheConfirmedConstitutionIdAndSettings
                  }
                />
              </p>
              <Link href="/admin/constitutions">
                <T value={reviewUi.backToConstitutions} />
              </Link>
            </aside>
          </div>
        </>
      ) : null}
    </WorkspacePage>
  );
}

/** Maps staging failures to safe localized messages without exposing upstream details. */
function stagingError(error?: string) {
  return error === "forbidden"
    ? ui.admin.import.page.editorRightsRequiredForStaging
    : error === "json"
      ? ui.admin.import.page.thatFileIsNotValidJson
      : error === "invalid"
        ? ui.admin.import.page.theJsonIsMissingRequiredImportFields
        : ui.admin.import.page.theImportCouldNotBeStarted;
}

/** One queue, with package membership resolved before showing individual imports. */
function recentImports(
  jobs: ImportJob[] | null,
  packages: Awaited<ReturnType<typeof getMigrationRuns>>,
) {
  return (
    <Card>
      <h2>
        <T value={importReviewUi.imports} />
      </h2>
      {!jobs || !packages ? (
        <Alert tone="error">
          <T value={ui.errors.servicesUnavailable} />
        </Alert>
      ) : null}
      {!jobs?.length && !packages?.length ? (
        <p className="muted">
          <T value={ui.admin.import.page.noImportsYet} />
        </p>
      ) : (
        <ul className="task-list">
          {packages?.map((item) => (
            <li key={item.id}>
              <Link href={packageReviewHref(item.id)}>{item.title}</Link>
              <span className="muted">
                <T value={importReviewUi.package} /> · {item.coverage.prepared}/
                {item.coverage.staged} <T value={importReviewUi.prepared} />
              </span>
            </li>
          ))}
          {jobs?.map((job) => (
            <li key={job.id}>
              <a href={`/editor?importJobId=${encodeURIComponent(job.id)}`}>
                {[job.constitutionTitle ?? job.isoCode, job.versionLabel]
                  .filter(Boolean)
                  .join(" · ") || job.id}
              </a>
              <Badge tone="info">
                <T value={statusMessage(job.status)} />
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
