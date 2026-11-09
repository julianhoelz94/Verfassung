import { notFound, redirect } from 'next/navigation';
import { currentUser, requireSessionBearer } from '../../../../lib/session';
import {
  getMigrationRun,
  getMigrationAttempts,
  getImportFidelity,
  readCapturedSource,
  type MigrationRun,
  type MigrationItem,
  type MigrationSource,
  type MigrationAttemptPage,
  type ImportFidelityPage,
} from '../../../../lib/migration-review';
import { getPreparedImportContent, getImportReviewDecisions } from '../../../../lib/ingestion-api';
import { getVersionSettings } from '../../../../lib/api';
import { migrationUi, migrationStateMessage } from '../../../../lib/migration-messages';
import { T } from '../../../components/TranslationProvider';
import { WorkspacePage } from '../../../components/layout/templates';
import { Grid } from '../../../components/layout/Layout';
import { PageHeader } from '../../../components/ui';
import { OrderedContentTree } from '../../../components/ConstitutionText';
import { NavigatingActionForm } from '../../../components/NavigatingActionForm';
import { prepareMigrationAction } from '../actions';

export default async function MigrationReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<MigrationQuery>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const user = await currentUser();
  if (!user) redirect(`/login?returnTo=${encodeURIComponent(`/admin/migrations/${id}`)}`);
  if (!user.roles.some((role) => ['editor', 'reviewer', 'publisher', 'admin'].includes(role))) redirect('/');
  const authorization = await requireSessionBearer();
  const run = await getMigrationRun(id, authorization);
  if (!run) notFound();
  const { selected, source, capture } = selectMigrationEvidence(run, query);
  const { original, evidenceFailed, prepared, outline, fidelity, decisions, attempts } =
    await loadMigrationReview(id, selected, source, capture, query, authorization);
  const offset = Math.max(0, Number.parseInt(query.sourceOffset ?? '0', 10) || 0);
  return (
    <WorkspacePage
      width="content"
      header={
        <PageHeader
          title={run.manifest.title}
          breadcrumbs={[
            { href: '/admin/migrations', label: <T value={migrationUi.migrations} /> },
            { label: run.manifest.title },
          ]}
        />
      }
    >
      {query.error ? (
        <p role="alert">
          <T value={migrationUi.prepareFailed} />
        </p>
      ) : null}
      <p>
        <T value={migrationUi.coverage} />: {run.coverage.prepared}/{run.coverage.staged} ·{' '}
        <T value={migrationUi.sources} />: {run.coverage.sources} · <T value={migrationUi.unavailable} />:{' '}
        {run.coverage.unavailable} · <T value={migrationUi.excluded} />: {run.coverage.excluded}
      </p>
      <form action={`/admin/migrations/${id}`}>
        <label htmlFor="migration-state">
          <T value={migrationUi.filter} />
        </label>
        <select name="state" id="migration-state" defaultValue={query.state ?? ''}>
          <option value="">—</option>
          {['staged', 'blocked', 'failed', 'prepared'].map((state) => (
            <option key={state} value={state}>
              <T value={migrationStateMessage(state)} />
            </option>
          ))}
        </select>
        <button type="submit">
          <T value={migrationUi.filter} />
        </button>
      </form>
      {migrationItems(run, id, query, user.roles)}
      <details>
        <summary>
          <T value={migrationUi.sources} />
        </summary>
        <ul>
          {run.manifest.sources.map((item) => (
            <li key={item.sourceKey}>
              <a
                href={`/admin/migrations/${id}?item=${selected?.id ?? ''}&source=${encodeURIComponent(item.sourceKey)}`}
              >
                {item.sourceKey}
              </a>{' '}
              · <a href={item.url}>{item.url}</a>
              {item.reason ? <> · {item.reason}</> : null}
              {item.attribution ? <> · {item.attribution}</> : null}
            </li>
          ))}
        </ul>
      </details>
      {selected?.result.jobId ? (
        <p>
          <a href={`/editor?importJobId=${selected.result.jobId}`}>
            <T value={migrationUi.openReview} />
          </a>
        </p>
      ) : null}
      {selected?.result.documentId ? (
        <p>
          <a href={`/editor/documents/${selected.result.documentId}`}>
            <T value={migrationUi.openDocument} />
          </a>
        </p>
      ) : null}
      {selected?.result.comparisonId ? (
        <p>
          <a href={`/comparisons/${selected.result.comparisonId}`}>
            <T value={migrationUi.openReview} />
          </a>
        </p>
      ) : null}
      {selected?.result.amendmentId ? (
        <p>
          <a href={`/editor/amendments/${selected.result.amendmentId}`}>
            <T value={migrationUi.openReview} />
          </a>
        </p>
      ) : null}
      {migrationFidelity(fidelity)}
      {migrationAttempts(attempts, id, selected)}
      {decisions.length ? (
        <section>
          <h2>
            <T value={migrationUi.decisions} />
          </h2>
          <ul>
            {decisions.map((item) => (
              <li key={item.id}>{item.reason}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <Grid columns={2}>
        {migrationSource(original, evidenceFailed, offset, id, selected, source, capture)}
        <section>
          <h2>
            <T value={migrationUi.preparedText} />
          </h2>
          {prepared ? (
            <OrderedContentTree
              entries={prepared.roots.map((node) => ({ type: 'child', node }))}
              outline={outline ?? undefined}
            />
          ) : (
            <p>
              <T value={migrationUi.notPrepared} />
            </p>
          )}
        </section>
      </Grid>
    </WorkspacePage>
  );
}

type MigrationQuery = {
  item?: string;
  source?: string;
  state?: string;
  sourceOffset?: string;
  error?: string;
  attemptOffset?: string;
};

/** Resolves requested source aliases before choosing an item and its captured source evidence. */
function selectMigrationEvidence(run: MigrationRun, query: MigrationQuery) {
  const requestedSource = run.manifest.sources.find((source) => source.sourceKey === query.source);
  const matchesSource = (key: string) =>
    !requestedSource ||
    requestedSource.sourceKey === key ||
    requestedSource.captureKey === key ||
    requestedSource.targetKeys?.includes(key);
  const selected =
    run.items.find((item) => item.id === query.item && matchesSource(item.sourceKey)) ??
    run.items.find((item) => matchesSource(item.sourceKey));
  const source =
    requestedSource ??
    run.manifest.sources.find(
      (item) =>
        item.sourceKey === selected?.sourceKey ||
        item.captureKey === selected?.sourceKey ||
        item.targetKeys?.includes(selected?.sourceKey ?? ''),
    ) ??
    run.manifest.sources[0];
  const capture = source?.captureKey
    ? run.items.find((item) => item.sourceKey === source.captureKey)
    : selected?.kind === 'document'
      ? selected
      : undefined;
  return { selected, source, capture };
}

/** Loads evidence, snapshot, settings, fidelity, decisions and attempts in their original order. */
async function loadMigrationReview(
  id: string,
  selected: MigrationItem | undefined,
  source: MigrationSource | undefined,
  capture: MigrationItem | undefined,
  query: MigrationQuery,
  authorization: string,
) {
  let original: string | null = null;
  let evidenceFailed = false;
  if (capture?.state === 'prepared' && source) {
    try {
      original = await readCapturedSource(capture, source, authorization);
    } catch {
      evidenceFailed = true;
    }
  }
  const prepared = selected?.result.versionId
    ? await getPreparedImportContent(selected.result.versionId, authorization)
    : null;
  const outline = selected?.result.versionId
    ? (await getVersionSettings(selected.result.versionId, authorization))?.outline
    : null;
  const fidelity =
    selected?.result.jobId && prepared ? await getImportFidelity(selected.result.jobId, authorization) : null;
  const decisions = selected?.result.jobId
    ? await getImportReviewDecisions(selected.result.jobId, authorization)
    : [];
  const attempts = selected
    ? await getMigrationAttempts(
        id,
        selected.id,
        Math.max(0, Number.parseInt(query.attemptOffset ?? '0', 10) || 0),
        authorization,
      )
    : null;
  return { original, evidenceFailed, prepared, outline, fidelity, decisions, attempts };
}

/** Filters only the item list; selected review details and preparation permissions stay independent. */
function migrationItems(run: MigrationRun, id: string, query: MigrationQuery, roles: string[]) {
  return (
    <ul>
      {run.items
        .filter((item) => !query.state || item.state === query.state)
        .map((item) => (
          <li key={item.id}>
            <a href={`/admin/migrations/${id}?item=${item.id}`}>{item.sourceKey}</a> ·{' '}
            <T
              value={migrationStateMessage(
                item.result.status === 'completed' || item.result.status === 'approved'
                  ? item.result.status
                  : item.state,
              )}
            />{' '}
            · <T value={migrationUi.attempts} />: {item.attempts}
            {item.error ? <p role="status">{item.error}</p> : null}
            {roles.some((role) => role === 'editor' || role === 'admin') && item.state !== 'prepared' ? (
              <NavigatingActionForm action={prepareMigrationAction}>
                <input type="hidden" name="runId" value={id} />
                <input type="hidden" name="itemId" value={item.id} />
                <button type="submit">
                  <T value={migrationUi.prepare} />
                </button>
              </NavigatingActionForm>
            ) : null}
          </li>
        ))}
    </ul>
  );
}

/** Retains completeness and truncated-mismatch guidance for the prepared snapshot. */
function migrationFidelity(fidelity: ImportFidelityPage | null) {
  return fidelity ? (
    <section>
      <h2>
        <T value={migrationUi.fidelity} />
      </h2>
      {fidelity.fidelity.length ? (
        <ul>
          {fidelity.fidelity.map((item, index) => (
            <li key={index}>
              {item.path}: {item.reason}
            </li>
          ))}
        </ul>
      ) : (
        <p>
          <T
            value={
              fidelity.fidelityComplete && fidelity.resourcesComplete
                ? migrationUi.fidelityPassed
                : migrationUi.fidelityIncomplete
            }
          />
        </p>
      )}
      {!fidelity.fidelityComplete && fidelity.fidelity.length >= 100 ? (
        <p role="alert">
          <T value={migrationUi.moreMismatches} />
        </p>
      ) : null}
    </section>
  ) : null;
}

/** Shows ordered attempts and the original next-offset navigation without changing selection. */
function migrationAttempts(
  attempts: MigrationAttemptPage | null,
  id: string,
  selected: MigrationItem | undefined,
) {
  return attempts?.items.length ? (
    <details>
      <summary>
        <T value={migrationUi.attempts} />
      </summary>
      <ol>
        {attempts.items.map((attempt) => (
          <li key={attempt.number}>
            {attempt.startedAt} · <T value={migrationStateMessage(attempt.state)} />
            {attempt.error ? <> · {attempt.error}</> : null}
          </li>
        ))}
      </ol>
      {attempts.nextOffset != null ? (
        <a href={`/admin/migrations/${id}?item=${selected?.id}&attemptOffset=${attempts.nextOffset}`}>
          <T value={migrationUi.next} />
        </a>
      ) : null}
    </details>
  ) : null;
}

/** Pages exact decoded source bytes while preserving the capture download and evidence failure state. */
function migrationSource(
  original: string | null,
  evidenceFailed: boolean,
  offset: number,
  id: string,
  selected: MigrationItem | undefined,
  source: MigrationSource | undefined,
  capture: MigrationItem | undefined,
) {
  const nextSource = original != null && offset + 30000 < original.length ? offset + 30000 : null;
  const pageHref = (next: number) =>
    `/admin/migrations/${id}?item=${selected?.id ?? ''}&source=${encodeURIComponent(source?.sourceKey ?? '')}&sourceOffset=${next}`;
  return (
    <section>
      <h2>
        <T value={migrationUi.source} />
      </h2>
      {capture?.result.documentId && capture.result.revision ? (
        <p>
          <a href={`/documents/${capture.result.documentId}?revision=${capture.result.revision}`}>
            <T value={migrationUi.downloadSource} />
          </a>
        </p>
      ) : null}
      {original != null ? (
        <>
          <p>
            {offset + 1}–{Math.min(offset + 30000, original.length)}/{original.length}
          </p>
          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {original.slice(offset, offset + 30000)}
          </pre>
          <nav>
            {offset > 0 ? (
              <a href={pageHref(Math.max(0, offset - 30000))}>
                ← <T value={migrationUi.previous} />
              </a>
            ) : null}
            {nextSource != null ? (
              <a href={pageHref(nextSource)}>
                <T value={migrationUi.next} /> →
              </a>
            ) : null}
          </nav>
        </>
      ) : (
        <p role={evidenceFailed ? 'alert' : 'status'}>
          <T value={evidenceFailed ? migrationUi.sourceInvalid : migrationUi.missingSource} />
        </p>
      )}
    </section>
  );
}
